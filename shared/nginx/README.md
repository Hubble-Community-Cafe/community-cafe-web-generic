# Shared nginx configuration

Both files are copied into `/etc/nginx/snippets/` by every site's Dockerfile and included from
that site's `nginx.conf`. Changing anything here rebuilds **all** sites (see `tools/changed-sites.mjs`).

| File | Included where | What it holds |
|------|----------------|---------------|
| `headers.conf` | inside every `location` block | security headers and the CSP |
| `static-site.conf` | once, inside the `server` block | clean URLs, caching, gzip, `/health`, 404 |

## Why the headers are repeated in every location

nginx's `add_header` does not merge across levels. If a `location` block declares **any**
`add_header` of its own, it inherits **none** of the ones declared at `server` or `http` level.
So a single server-level block of security headers silently vanishes from every location that
sets its own `Cache-Control`, which is all of them.

There is no way to opt back into inheritance, so the headers are declared once in `headers.conf`
and `include`d in each location. Any new `location` block in a site's `nginx.conf` must include
it too. `tools/smoke.sh` asserts the headers are actually present on a real response, which is
what catches a forgotten include.

## What a site's nginx.conf is responsible for

Only the parts that genuinely differ per site:

```nginx
# Legacy query-string URLs, if the old site had any. A `map` must sit at http level,
# so it goes above the server block, not inside it.
map $arg_body $legacy_body {
    default  "/";
    score    "/score";
}

server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;

    include /etc/nginx/snippets/static-site.conf;

    # Legacy path redirects, one per old URL. Keep these in sync with redirects.txt,
    # which is what tools/smoke.sh asserts against.
    location = /index.php { return 301 $legacy_body; }
    rewrite ^/oude-pagina/?$ /nieuwe-pagina permanent;
}
```

## Changing the CSP

The CSP in `headers.conf` has no `'unsafe-inline'` and no external origins, which is achievable
because these sites are hand-written with their styles and scripts in files. Loosening it is
almost always the wrong fix: move the inline style or script into a file, or self-host the asset.
