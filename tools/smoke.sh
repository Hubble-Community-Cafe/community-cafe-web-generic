#!/usr/bin/env bash
# Runtime checks against a running site container.
#
#   tools/smoke.sh <site> [base-url]
#
# The base URL defaults to http://127.0.0.1:<port from site.json>. 127.0.0.1 rather than
# localhost on purpose: localhost resolves to both 127.0.0.1 and ::1, and requests can land
# on a different listener than the docker-published port.
#
# Asserts what only a real response can prove:
#   - / serves, /health answers, /favicon.ico is the site's icon or an empty 204
#   - the security headers survived (a location block that forgot to include headers.conf
#     silently drops them, which is the whole reason this check exists)
#   - the CSP is the strict one, with no 'unsafe-inline'
#   - CSS and JS revalidate on every use (no-cache, 304); other assets cache for an hour
#   - every legacy URL in redirects.txt 301s to where it should

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="${1:-}"

if [ -z "$SITE" ]; then
  echo "usage: tools/smoke.sh <site> [base-url]" >&2
  exit 2
fi

SITE_DIR="$ROOT/sites/$SITE"
if [ ! -f "$SITE_DIR/site.json" ]; then
  echo "No such site: $SITE (expected $SITE_DIR/site.json)" >&2
  exit 2
fi

if [ -n "${2:-}" ]; then
  BASE="$2"
else
  PORT="$(node -e "process.stdout.write(String(require('$SITE_DIR/site.json').port))")"
  BASE="http://127.0.0.1:$PORT"
fi

failures=0
pass() { printf '  ok    %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1" >&2; failures=$((failures + 1)); }

echo "Smoke testing $SITE at $BASE"

# ── Availability ──────────────────────────────────────────────────────────────
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/" || echo 000)"
if [ "$code" = "200" ]; then pass "GET / -> 200"; else fail "GET / -> $code (expected 200)"; fi

health="$(curl -sS --max-time 10 "$BASE/health" || true)"
if [ "$(printf '%s' "$health" | tr -d '[:space:]')" = "OK" ]; then
  pass "GET /health -> OK"
else
  fail "GET /health -> '$health' (expected OK)"
fi

# The shared config answers /favicon.ico with the site's file, or an empty 204 when the site
# has none. A 404 here means that location is missing and every visit renders the 404 page.
favicon_headers="$(curl -sS -D - -o /dev/null --max-time 10 "$BASE/favicon.ico" || true)"
code="$(printf '%s' "$favicon_headers" | head -1 | awk '{print $2}')"
if [ -f "$SITE_DIR/public/favicon.ico" ]; then want=200; else want=204; fi
if [ "$code" = "$want" ]; then pass "GET /favicon.ico -> $want"; else fail "GET /favicon.ico -> $code (expected $want)"; fi
if printf '%s' "$favicon_headers" | grep -qi '^content-security-policy:'; then
  pass "headers present on /favicon.ico"
else
  fail "/favicon.ico is missing the security headers (did its location include headers.conf?)"
fi

# ── Security headers on the HTML document ─────────────────────────────────────
headers="$(curl -sS -D - -o /dev/null --max-time 10 "$BASE/" || true)"
for name in \
  x-content-type-options \
  x-frame-options \
  referrer-policy \
  permissions-policy \
  content-security-policy
do
  if printf '%s' "$headers" | grep -qi "^$name:"; then
    pass "header $name present"
  else
    fail "header $name missing on / (did a location block forget to include headers.conf?)"
  fi
done

csp="$(printf '%s' "$headers" | grep -i '^content-security-policy:' || true)"
if printf '%s' "$csp" | grep -q "unsafe-inline"; then
  fail "CSP contains 'unsafe-inline'; move the inline style or script into a file instead"
else
  pass "CSP has no 'unsafe-inline'"
fi

# The same headers must survive on a static asset, which a DIFFERENT location block
# serves. This is what catches a headers.conf include that was only half applied. Not the
# root favicon.ico (an exact location of its own, checked further up), and not CSS or JS,
# which have their own location too (checked below).
asset="$(cd "$SITE_DIR/public" 2>/dev/null && find . -type f \
  \( -name '*.png' -o -name '*.jpg' -o -name '*.svg' -o -name '*.webp' -o -name '*.ico' -o -name '*.woff2' \) \
  ! -path ./favicon.ico | head -1 | sed 's|^\.||')"
if [ -n "$asset" ]; then
  asset_headers="$(curl -sS -D - -o /dev/null --max-time 10 "$BASE$asset" || true)"
  if ! printf '%s' "$asset_headers" | grep -qiE '^HTTP/[0-9.]+ 200'; then
    fail "static asset $asset did not return 200"
  elif printf '%s' "$asset_headers" | grep -qi '^content-security-policy:'; then
    pass "headers present on static assets too ($asset)"
  else
    fail "static asset location is missing the security headers (did it include headers.conf?)"
  fi

  # Exactly one Cache-Control, and it carries the max-age. `expires` next to an add_header
  # Cache-Control would send two conflicting ones.
  cache="$(printf '%s' "$asset_headers" | grep -i '^cache-control:' | tr -d '\r' || true)"
  cache_count="$(printf '%s' "$cache" | grep -c . || true)"
  if [ "$cache_count" = "1" ] && printf '%s' "$cache" | grep -q 'max-age=3600'; then
    pass "one Cache-Control on static assets ($(printf '%s' "$cache" | cut -d' ' -f2-))"
  else
    fail "static asset sends $cache_count Cache-Control header(s), expected one with max-age=3600"
  fi
else
  echo "  note  no static assets found, skipping asset header check"
fi

# CSS and JS are revalidated on every use, so a deploy never pairs fresh HTML with a stale
# stylesheet or script: Cache-Control no-cache, the security headers, and a 304 with no body
# when the browser already has the current file.
code_asset="$(cd "$SITE_DIR/public" 2>/dev/null && find . -type f \( -name '*.css' -o -name '*.js' \) | head -1 | sed 's|^\.||')"
if [ -n "$code_asset" ]; then
  code_headers="$(curl -sS -D - -o /dev/null --max-time 10 "$BASE$code_asset" || true)"
  cache="$(printf '%s' "$code_headers" | grep -i '^cache-control:' | tr -d '\r' || true)"
  if [ "$(printf '%s' "$cache" | grep -c .)" = "1" ] && printf '%s' "$cache" | grep -qi 'no-cache'; then
    pass "CSS/JS revalidate on every use ($code_asset: $(printf '%s' "$cache" | cut -d' ' -f2-))"
  else
    fail "$code_asset sends '$cache', expected one Cache-Control: no-cache"
  fi
  if printf '%s' "$code_headers" | grep -qi '^content-security-policy:'; then
    pass "headers present on CSS/JS too"
  else
    fail "CSS/JS location is missing the security headers (did it include headers.conf?)"
  fi
  etag="$(printf '%s' "$code_headers" | grep -i '^etag:' | cut -d' ' -f2- | tr -d '\r')"
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 -H "If-None-Match: $etag" "$BASE$code_asset" || echo 000)"
  if [ "$code" = "304" ]; then pass "revalidating $code_asset -> 304"; else fail "revalidating $code_asset -> $code (expected 304)"; fi
fi

# And on the responses no page location serves: a trailing-slash 301 (every site has the
# normaliser), /health, and the 403 on a dotfile. These get their headers from the
# server-level include in static-site.conf, so this catches that include going missing.
for probe in '301:/smoke-probe/' '200:/health' '403:/.env'; do
  want="${probe%%:*}"
  path="${probe#*:}"
  probe_headers="$(curl -sS -D - -o /dev/null --max-time 10 "$BASE$path" || true)"
  if ! printf '%s' "$probe_headers" | grep -qiE "^HTTP/[0-9.]+ $want"; then
    fail "GET $path did not return $want, cannot check its headers"
  elif printf '%s' "$probe_headers" | grep -qi '^content-security-policy:' \
    && printf '%s' "$probe_headers" | grep -qi '^x-frame-options:'; then
    pass "headers present on the $want from $path"
  else
    fail "the $want from $path is missing the security headers (server-level include gone?)"
  fi
done

# server_tokens off: the Server header must not name the nginx version.
server="$(printf '%s' "$headers" | grep -i '^server:' | tr -d '\r' || true)"
if printf '%s' "$server" | grep -qE '/[0-9]'; then
  fail "\"$server\" reveals the nginx version (server_tokens off missing?)"
else
  pass "Server header has no version (${server:-absent})"
fi

# ── Legacy redirects ──────────────────────────────────────────────────────────
REDIRECTS="$SITE_DIR/redirects.txt"
if [ -f "$REDIRECTS" ]; then
  while IFS= read -r raw; do
    line="${raw%%#*}"
    line="$(printf '%s' "$line" | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//')"
    [ -z "$line" ] && continue

    from="${line%% *}"
    to="${line##* }"

    # The raw Location header, compared exactly. nginx emits relative locations
    # (absolute_redirect off), so "/score" must come back as "/score", and an off-site
    # target as the full URL. A suffix match would also accept "https://elsewhere/score".
    result="$(curl -sS -o /dev/null -w '%{http_code} %header{location}' --max-time 10 "$BASE$from" || echo "000 ")"
    got_code="${result%% *}"
    got_location="${result#* }"

    if [ "$got_code" != "301" ]; then
      fail "$from -> $got_code (expected 301)"
    elif [ "$got_location" = "$to" ]; then
      pass "$from -> 301 $to"
    else
      fail "$from -> 301 $got_location (expected $to)"
    fi
  done < "$REDIRECTS"
else
  echo "  note  no redirects.txt, skipping legacy URL checks"
fi

# ── No open redirect ──────────────────────────────────────────────────────────
# The trailing-slash normaliser echoes part of the path back in Location. Browsers read
# "/\host" and "//host" as a different origin, and drop tabs and newlines first, so none
# of these may come back as a redirect that leaves the site.
for probe in '//evil.example/' '/%5Cevil.example/' '/%2F%2Fevil.example/' '/%09/evil.example/' '/%5C%5Cevil.example/'; do
  location="$(curl -sS -o /dev/null -w '%header{location}' --path-as-is --max-time 10 "$BASE$probe" || true)"
  if printf '%s' "$location" | LC_ALL=C grep -qE '^(//|/\\|\\|[a-zA-Z][a-zA-Z0-9+.-]*:)|[[:cntrl:]]'; then
    fail "$probe -> Location \"$location\" leaves the site (open redirect)"
  else
    pass "$probe does not redirect off-site"
  fi
done

# ── Dotfiles are denied ───────────────────────────────────────────────────────
# Asserted as a 403 from the deny rule, not just "not 200": none of these files exist, so
# a 404 would mean some other location handled the request. The .css and .js probes are
# the ones that matter: they prove the deny rule wins over the static asset location.
for probe in '/.env' '/.git/config' '/.git/x.css' '/.hidden/app.js' '/img/.secret.png'; do
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$probe" || echo 000)"
  if [ "$code" = "403" ]; then
    pass "GET $probe -> 403"
  else
    fail "GET $probe -> $code (expected 403, the dotfile deny rule did not apply)"
  fi
done

# ── No redirect loop on a directory ───────────────────────────────────────────
# A directory without an index.html must answer directly, not bounce between "/css"
# and "/css/" until the browser gives up.
dir="$(cd "$SITE_DIR/public" 2>/dev/null && find . -mindepth 1 -type d ! -name '.*' \
  ! -exec test -e '{}/index.html' ';' -print | head -1 | sed 's|^\.||')"
if [ -n "$dir" ]; then
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$BASE$dir" || echo 000)"
  if [ "$code" = "404" ]; then
    pass "GET $dir (directory, no index) -> 404"
  else
    fail "GET $dir (directory, no index) -> $code (expected 404, a 301 here loops)"
  fi
else
  echo "  note  no directory without an index.html, skipping the redirect loop check"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "$SITE: all smoke checks passed"
else
  echo "$SITE: $failures check(s) failed" >&2
fi
exit $((failures > 0))
