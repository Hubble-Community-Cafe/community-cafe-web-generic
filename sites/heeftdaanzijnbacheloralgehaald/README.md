# Heeft Daan zijn bachelor al gehaald?

Static site for **heeftdaanzijnbacheloralgehaald.nl**. It answers the question in the domain
name, in one word, and nothing else. The answer is currently **JA**.

`"status": "live"`, because the answer is content that can change. If it ever needs to go back
to **NEE**, that is an edit to `public/index.html` (the word and the `<title>`) plus a version
bump in `site.json`.

## Origin

Migrated from the legacy Plesk hosting in August 2026. Unlike the other sites here it was
already plain static HTML, not PHP: a single 589 byte `index.html` with its CSS in a `<style>`
block. There were no images, no scripts and no other pages.

```bash
curl -sS https://heeftdaanzijnbacheloralgehaald.nl/
```

## Page map

| Old URL | New URL | Notes |
|---------|---------|-------|
| `/` | `/` | |
| `/index.html` | `/index.html` | still a 200, not redirected, see `nginx.conf` |

## What changed in the conversion

Almost nothing. The layout, colours, font and text are untouched.

- **The `<style>` block moved to `css/site.css`**, verbatim. This is the only change the
  conversion actually required: the Content-Security-Policy has no `'unsafe-inline'`, so an
  inline `<style>` would be blocked.
- **`lang="en"` became `lang="nl"`.** The page's only word is "JA", which is Dutch. An English
  screen reader would have pronounced it as the English letters. Not a content change.
- Added `404.html`, `robots.txt` and `sitemap.xml`, which the original did not have.

## Quirks

- **The `<title>` really is just "JA".** That is the joke, so it is kept verbatim rather than
  expanded into something descriptive.
- **No favicon.** The original had none and one was not invented.
- **`www` currently works over HTTPS** on the old host, unlike bunkerbar.nl. Make sure the Nginx
  Proxy Manager host covers both `heeftdaanzijnbacheloralgehaald.nl` and
  `www.heeftdaanzijnbacheloralgehaald.nl` before cutting over, or `www` will regress.
- This domain sits on a different Plesk host to the other sites (`94.130.182.172` rather than
  `116.203.95.157`), so decommissioning it is a separate job.

## Local

```bash
docker compose up --build -d heeftdaanzijnbacheloralgehaald
node tools/check-sites.mjs heeftdaanzijnbacheloralgehaald
tools/smoke.sh heeftdaanzijnbacheloralgehaald
```

Serves on <http://127.0.0.1:9822>.
