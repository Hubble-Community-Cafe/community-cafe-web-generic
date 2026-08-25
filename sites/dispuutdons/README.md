# Dispuut Dons

Static site for **dispuutdons.nl**, the dispuut of former board members of Stichting Bar
Potential.

Unlike [bunkerbar](../bunkerbar/README.md) this site is `"status": "live"`, so its content is
expected to change. It is still a single page.

## Origin

Migrated from the legacy Plesk hosting (nginx + PHP 8.0.30) in August 2026. The site was a
single `index.php`; `/` and `/index.php` served the same page and nothing else existed
(no `robots.txt`, no `sitemap.xml`, every other path 404'd).

```bash
curl -sS https://dispuutdons.nl/           # the one page
curl -sS https://dispuutdons.nl/css/style.css
curl -sS https://dispuutdons.nl/img/{logo-Dons-header-2.0.png,Ledenfoto.jpg,Dons_favicon2.ico}
```

## Page map

| Old URL | New URL |
|---------|---------|
| `/` | `/` |
| `/index.php` | `/` |

## What the original loaded from third parties

Seven external resources, none of which may stay under this repo's no-third-party rule. Measured
against the live site before removing anything:

| Resource | Actually used for | Verdict |
|----------|-------------------|---------|
| Materialize CSS 1.0 | `.container`, `.card`, `.card-content`, `.card-title`, `.scale-transition` | replaced by about 60 lines of CSS |
| Materialize JS 1.0 | nothing | dropped |
| jQuery 3.6 | adding `scale-in` to the two cards on load, plus a `.collapsible()` call on an element that does not exist | replaced by a CSS animation, no JS at all |
| Slick carousel 1.8 (CSS + JS) | nothing, there is no carousel | dropped |
| Iconify 1.0.7 | nothing, there are no icons | dropped |
| Google Fonts Roboto | nothing: `css/style.css` sets `font-family: sans-serif` on `body`, which wins, so Roboto never applied | dropped |
| Google Material Icons | nothing | dropped |
| `axis-bold` from dafontfree.net | declared for `h1`, but **never actually applied** | replaced by the self-hosted AXIS, see below |

### The heading font

`css/style.css` set `h1 { font-family: 'axis-bold', sans-serif }` and the page linked a
stylesheet from `dafontfree.net` to provide it. That link **never worked**: dafontfree serves the
stylesheet as `text/html`, so the browser refuses it as CSS and no `@font-face` is ever
registered. Verified on the live site before the rewrite: no `axis-bold` face in
`document.fonts`, and the heading measured exactly the same width as plain `sans-serif`. So the
heading on the old site renders in the fallback, not in AXIS.

It is now served properly, from `public/fonts/AXIS.woff2`, the same file the Hubble and Meteor
sites use (`community-cafe-web/shared-web/fonts/AXIS.woff2`). The typeface is by
**Jean Wojciechowski**, which is what the font's own copyright and designer fields say. The
dafontfree copy carries a stray "Copyright 2014 Adobe Systems Incorporated" string, which is
Adobe FDK build boilerplate: both files were produced with Adobe's `makeotf`/`hotconv` tooling,
and the properly attributed copy credits the designer.

**This is the one intended visual change in the conversion:** the heading goes from the
sans-serif fallback to AXIS, which is what the original author asked for and what ties the site
to the Hubble and Meteor branding. Everything else is pixel-matched to the live site.

## Quirks

- **No JavaScript at all.** The card entrance animation is a CSS `@keyframes` with
  `animation-fill-mode: backwards`, so the cards' resting state is their natural, visible one and
  the animation only supplies the `scale(0)` start. The original inverted this: the cards were
  `scale(0)` in CSS and only became visible once jQuery ran, which is why it needed a `<noscript>`
  block forcing `scale(1)`. There is now also a `prefers-reduced-motion` path, which the original
  lacked.
- **The footer reads "KVK-nummer:" with no number.** That is how it is on the live site. Left
  verbatim rather than invented; fill it in or drop the label.
- The `#boortekening` id on the members-photo card is the original's, kept as-is even though the
  name no longer describes the content.
- The original had an empty `<h1 class="cards-subject"></h1>` whose only effect was its margins.
  The element is gone; its 33px of spacing is reproduced in CSS so the cards sit where they did.

## Local

```bash
docker compose up --build -d dispuutdons
node tools/check-sites.mjs dispuutdons
tools/smoke.sh dispuutdons
```

Serves on <http://127.0.0.1:9821>.
