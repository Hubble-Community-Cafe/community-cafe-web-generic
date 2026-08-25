# Community Café Web Generic

A **library of small static websites**, each shipped as its own nginx container to Portainer.

This is where the left-over sites live: the ones that are a handful of pages, need no CMS, no
database and no backend, and were sitting on legacy Plesk hosting. The bigger rebuild of
hubble.cafe and meteor.cafe lives in the sibling `community-cafe-web` repo, which is also where
the conventions here come from.

## Sites

| Site | Domain | Port | Status |
|------|--------|------|--------|
| [`bunkerbar`](sites/bunkerbar/README.md) | bunkerbar.nl | 9820 | archive |
| [`dispuutdons`](sites/dispuutdons/README.md) | dispuutdons.nl | 9821 | live |
| [`heeftdaanzijnbacheloralgehaald`](sites/heeftdaanzijnbacheloralgehaald/README.md) | heeftdaanzijnbacheloralgehaald.nl | 9822 | live |

## How a site is put together

Plain HTML, CSS and vanilla JavaScript. **No framework, no bundler, no build step**, so there is
nothing to install, nothing to keep patched, and the files in `public/` are exactly what the
browser receives. A site that needs a bundler does not belong in this repo.

```
sites/<name>/
├── site.json        name, version, domains, port, status
├── Dockerfile       single-stage nginx:alpine, runs as the nginx user
├── nginx.conf       only what differs per site: legacy URL redirects
├── redirects.txt    old URL -> expected target, asserted by the smoke test
├── README.md        where the content came from, and any quirks
└── public/          exactly what gets served
```

Everything shared lives in [`shared/nginx/`](shared/nginx/README.md): the security headers, the
Content-Security-Policy, clean URLs, caching, gzip and the `/health` endpoint. A site's own
`nginx.conf` includes it and adds only its redirects.

## Ground rules

- **No third-party requests, ever.** No CDN, no Google Fonts, no hosted icon set, no analytics,
  no cookies. Everything is self-hosted. `tools/check-sites.mjs` fails the build on an external
  subresource in any HTML or CSS file.
- **The CSP is strict** and contains no `'unsafe-inline'`. Inline styles, inline scripts and
  `onclick=` handlers are therefore build failures, not style preferences.
- **Old URLs never break.** A migrated site 301s every legacy path it used to serve.
- **Sites are independent.** Each carries its own version and is built, published and released
  on its own; editing one never touches another's image.

## Working on a site

```bash
node tools/check-sites.mjs          # contract, third-party refs, broken links, CSP problems
docker compose up --build -d        # every site, one port each
tools/smoke.sh <site>               # headers, CSP, /health, every legacy redirect
```

Both checks are dependency-free (plain Node and curl), so there is no `npm install` step
anywhere in this repo.

## Adding a site

```bash
tools/new-site.sh <name> "<Title>" <primary-domain>
```

That scaffolds `sites/<name>/` with the next free port assigned. The full migration recipe,
from snapshotting the old host to the DNS cutover, is in
[`docs/adding-a-site.md`](docs/adding-a-site.md) and
[`docs/migration-checklist.md`](docs/migration-checklist.md).

## Deployment

CI builds and pushes one image per changed site to GHCR
(`ghcr.io/hubble-community-cafe/community-cafe-web-generic-<site>`), behind a manual approval
gate, tagged `:latest`, `:v<version>` and `:main-<sha>`.

All sites run in **one Portainer stack**, one service per site, reverse-proxied by Nginx Proxy
Manager. Copy [`docker-compose.portainer.template.yml`](docker-compose.portainer.template.yml)
and fill in the version tags.

Monitoring is one Uptime Kuma monitor per domain. There is deliberately no Sentry and no
analytics: there is no client-side application to instrument.
