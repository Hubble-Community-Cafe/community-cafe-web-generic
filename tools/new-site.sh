#!/usr/bin/env bash
# Scaffold a new site.
#
#   tools/new-site.sh <name> "<Title>" <primary-domain>
#
# Creates sites/<name>/ with the full contract filled in and the next free port
# assigned. It does NOT touch the compose files or the README: those edits are listed
# at the end so you make them deliberately.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NAME="${1:-}"
TITLE="${2:-}"
DOMAIN="${3:-}"

if [ -z "$NAME" ] || [ -z "$TITLE" ] || [ -z "$DOMAIN" ]; then
  echo 'usage: tools/new-site.sh <name> "<Title>" <primary-domain>' >&2
  echo 'example: tools/new-site.sh dispuutdons "Dispuut Dons" dispuutdons.nl' >&2
  exit 2
fi

if ! printf '%s' "$NAME" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$'; then
  echo "Site name must be lowercase kebab-case, got: $NAME" >&2
  exit 2
fi

DIR="$ROOT/sites/$NAME"
if [ -e "$DIR" ]; then
  echo "sites/$NAME already exists" >&2
  exit 2
fi

# Next free port in the range this repo owns.
PORT=9820
while [ -n "$(find "$ROOT/sites" -maxdepth 2 -name site.json -exec grep -l "\"port\": $PORT" {} + 2>/dev/null)" ]; do
  PORT=$((PORT + 1))
done
if [ "$PORT" -gt 9899 ]; then
  echo "No free port left in 9820-9899" >&2
  exit 1
fi

mkdir -p "$DIR/public/css" "$DIR/public/images"

cat > "$DIR/site.json" <<JSON
{
  "name": "$NAME",
  "version": "0.1.0",
  "title": "$TITLE",
  "domains": ["$DOMAIN", "www.$DOMAIN"],
  "port": $PORT,
  "status": "live"
}
JSON

cat > "$DIR/Dockerfile" <<DOCKER
# Build context is the repo ROOT (so shared/nginx/ is reachable), not this folder:
#   docker build -f sites/$NAME/Dockerfile -t $NAME .

FROM nginx:alpine

# Security patches
RUN apk upgrade --no-cache

COPY shared/nginx/ /etc/nginx/snippets/
COPY sites/$NAME/nginx.conf /etc/nginx/conf.d/default.conf
COPY sites/$NAME/public/ /usr/share/nginx/html/

RUN chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/conf.d /var/cache/nginx && \\
    touch /var/run/nginx.pid && \\
    chown nginx:nginx /var/run/nginx.pid

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
    CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

EXPOSE 80
USER nginx
CMD ["nginx", "-g", "daemon off;"]
DOCKER

cat > "$DIR/nginx.conf" <<'NGINX'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;

    # Shared: clean URLs, caching, gzip, /health, 404. Security headers are included
    # per location inside it (see shared/nginx/README.md for why).
    include /etc/nginx/snippets/static-site.conf;

    # Legacy URL redirects from the old site go here, one per old path. Keep them in
    # sync with redirects.txt, which is what tools/smoke.sh asserts against.
    # Example:
    #   rewrite ^/oude-pagina/?$ /nieuwe-pagina permanent;

    # Normalise any remaining trailing slash to the slashless clean URL.
    rewrite ^/(.+)/$ /$1 permanent;
}
NGINX

cat > "$DIR/redirects.txt" <<TXT
# Legacy URLs that must keep working, asserted by tools/smoke.sh.
# Format: <old-path> <expected-location>
#
# /oude-pagina /nieuwe-pagina
TXT

cat > "$DIR/README.md" <<MD
# $TITLE

Static site for **$DOMAIN**, served from a single nginx container.

## Origin

Migrated from the legacy Plesk hosting on <!-- date -->. Snapshot taken with:

\`\`\`bash
wget --mirror --page-requisites --no-parent --convert-links https://$DOMAIN/
\`\`\`

## Quirks

<!-- Anything a future reader needs: assets that had to be recreated, pages that were
     dropped, third-party libraries that were replaced, content decisions. -->

## Local

\`\`\`bash
docker compose up --build -d $NAME
node tools/check-sites.mjs $NAME
tools/smoke.sh $NAME
\`\`\`

Serves on <http://127.0.0.1:$PORT>.
MD

cat > "$DIR/public/index.html" <<HTML
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>$TITLE</title>
  <link rel="stylesheet" href="/css/site.css">
</head>
<body>
  <h1>$TITLE</h1>
</body>
</html>
HTML

printf '/* %s */\n' "$TITLE" > "$DIR/public/css/site.css"

cat > "$DIR/public/robots.txt" <<TXT
User-agent: *
Allow: /

Sitemap: https://$DOMAIN/sitemap.xml
TXT

chmod -R u+rw "$DIR"

echo "Created sites/$NAME on port $PORT."
echo
echo "Still to do by hand:"
echo "  1. docker-compose.yml: add the $NAME service on port $PORT"
echo "  2. docker-compose.portainer.template.yml: add the $NAME service"
echo "  3. .github/dependabot.yml: nothing, /sites/* is matched by a wildcard"
echo "  4. README.md: add $NAME to the site table"
echo "  5. Drop the snapshot into sites/$NAME/public/ and commit it unmodified first"
