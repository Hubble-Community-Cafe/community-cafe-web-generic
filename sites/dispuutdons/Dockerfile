# Build context is the repo ROOT (so shared/nginx/ is reachable), not this folder:
#   docker build -f sites/dispuutdons/Dockerfile -t dispuutdons .

FROM nginx:alpine

# Security patches
RUN apk upgrade --no-cache

COPY shared/nginx/ /etc/nginx/snippets/
COPY sites/dispuutdons/nginx.conf /etc/nginx/conf.d/default.conf
COPY sites/dispuutdons/public/ /usr/share/nginx/html/

RUN chown -R nginx:nginx /usr/share/nginx/html /etc/nginx/conf.d /var/cache/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1

EXPOSE 80
USER nginx
CMD ["nginx", "-g", "daemon off;"]
