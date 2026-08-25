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
#   - / serves, /health answers
#   - the security headers survived (a location block that forgot to include headers.conf
#     silently drops them, which is the whole reason this check exists)
#   - the CSP is the strict one, with no 'unsafe-inline'
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
# serves. This is what catches a headers.conf include that was only half applied.
asset="$(cd "$SITE_DIR/public" 2>/dev/null && find . -type f \
  \( -name '*.css' -o -name '*.js' -o -name '*.png' -o -name '*.jpg' -o -name '*.svg' -o -name '*.webp' -o -name '*.ico' \) \
  | head -1 | sed 's|^\.||')"
if [ -n "$asset" ]; then
  asset_headers="$(curl -sS -D - -o /dev/null --max-time 10 "$BASE$asset" || true)"
  if ! printf '%s' "$asset_headers" | grep -qiE '^HTTP/[0-9.]+ 200'; then
    fail "static asset $asset did not return 200"
  elif printf '%s' "$asset_headers" | grep -qi '^content-security-policy:'; then
    pass "headers present on static assets too ($asset)"
  else
    fail "static asset location is missing the security headers (did it include headers.conf?)"
  fi
else
  echo "  note  no static assets found, skipping asset header check"
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

    result="$(curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "$BASE$from" || echo "000 ")"
    got_code="${result%% *}"
    got_location="${result#* }"

    if [ "$got_code" != "301" ]; then
      fail "$from -> $got_code (expected 301)"
    elif [ "${got_location%$to}" != "$got_location" ] || [ "$got_location" = "$to" ]; then
      pass "$from -> 301 $to"
    else
      fail "$from -> 301 $got_location (expected $to)"
    fi
  done < "$REDIRECTS"
else
  echo "  note  no redirects.txt, skipping legacy URL checks"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "$SITE: all smoke checks passed"
else
  echo "$SITE: $failures check(s) failed" >&2
fi
exit $((failures > 0))
