## What does this PR do?
<!-- Brief description of the changes. Name the site(s) it touches. -->

## Type of change
- [ ] New site migrated
- [ ] Content or design fix on an existing site
- [ ] Shared config (nginx snippets, tooling)
- [ ] CI / DevOps
- [ ] Documentation
- [ ] Other: <!-- describe -->

## Checklist
- [ ] `node tools/check-sites.mjs` passes
- [ ] `docker compose up --build` serves the site and `tools/smoke.sh <site>` passes
- [ ] Design parity verified against the live site (desktop and mobile)
- [ ] Every legacy URL still resolves, and is listed in the site's `redirects.txt`
- [ ] No third-party requests introduced (no CDN, fonts, icons or analytics)
- [ ] The site's `version` in `site.json` is bumped
- [ ] No secrets or credentials are committed
- [ ] README / docs updated (if needed)
