# Build context is the repo ROOT (so shared/nginx/ is reachable), not this folder:
#   docker build -f sites/vouweenbak/Dockerfile -t vouweenbak .

# Pinned by digest so a rebuild is reproducible; Dependabot bumps the tag and digest.
FROM nginx:1.31.8-alpine@sha256:fed7e14be83cbd2661a75cdc5b872d936cf155d46c327084d30b8df19ae88d72

# Security patches
RUN apk upgrade --no-cache

COPY shared/nginx/ /etc/nginx/snippets/
COPY sites/vouweenbak/nginx.conf /etc/nginx/conf.d/default.conf
COPY sites/vouweenbak/public/ /usr/share/nginx/html/

# The nginx user may write only its cache and pid file. The content and the config stay
# root-owned (and world-readable), so a compromised worker cannot rewrite the site.
RUN chown -R nginx:nginx /var/cache/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

EXPOSE 80
USER nginx
CMD ["nginx", "-g", "daemon off;"]
