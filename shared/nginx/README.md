# Shared nginx configuration

Both files are copied into `/etc/nginx/snippets/` by the root `Dockerfile` and included from
each site's `nginx.conf`. Changing anything here rebuilds **all** sites (see `tools/changed-sites.mjs`).

| File | Included where | What it holds |
|------|----------------|---------------|
| `headers.conf` | at `server` level, and inside every `location` with its own `add_header` | security headers and the CSP |
| `static-site.conf` | once, inside the `server` block | clean URLs, caching, gzip, `/health`, 404, `server_tokens off` |

## Why the headers are included more than once

nginx's `add_header` does not merge across levels. If a `location` block declares **any**
`add_header` of its own, it inherits **none** of the ones declared at `server` or `http` level.
So a single server-level block of security headers silently vanishes from every location that
sets its own `Cache-Control`.

There is no way to opt back into inheritance, so the headers are declared once in `headers.conf`
and `include`d twice over:

- at `server` level, by `static-site.conf`. That covers every response from a location that
  adds no header of its own: the legacy 301s, `/health` and the 403 on a dotfile.
- inside each location that sets its own `Cache-Control` (`/`, static assets, the 404 page).

A redirect-only `location` in a site's `nginx.conf` needs nothing extra. A new location that
adds **any** header must include `headers.conf` too. `tools/smoke.sh` asserts the headers on a
page, an asset, a legacy redirect, `/health` and a dotfile, which is what catches a forgotten
include.

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
