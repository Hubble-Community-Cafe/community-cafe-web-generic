# Bunkerbar

Static archive of **bunkerbar.nl**, the site of the Bunkerbar and Stichting Culturele
Ontmoetingsruimte Eindhoven (SCOrE).

`"status": "archive"` in `site.json`: the bar closed in October 2017 and the foundation was
dissolved on 30 May 2019. **The content is frozen.** Fix bugs and security issues; do not edit
the copy, the imagery or the design.

## Origin

Migrated from the legacy Plesk hosting in August 2026. The old site was PHP: one `index.php`
that switched its body on a query parameter, with navigation done through
`onclick="location.href=..."` rather than links.

`wget --mirror` could not be used, because the navigation is JavaScript rather than `<a href>`
and a crawler finds none of the pages. Each body was fetched directly instead:

```bash
curl -sS "https://bunkerbar.nl/index.php"                  # De bar (the default body)
curl -sS "https://bunkerbar.nl/index.php?body=score"
curl -sS "https://bunkerbar.nl/index.php?body=verenigingen"
curl -sS "https://bunkerbar.nl/index.php?body=contact"
curl -sS "https://bunkerbar.nl/index.php?body=sitemap"
curl -sS "https://bunkerbar.nl/index.php?body=disclaimer"
```

`sitemap` and `disclaimer` are only reachable from the footer, and were nearly missed. If
another body value turns up in the Plesk source or in the access logs, it belongs here too.

## Page map

| Old URL | New URL | File |
|---------|---------|------|
| `/index.php` | `/` | `index.html` |
| `/index.php?body=begin` | `/` | (same content as the default body) |
| `/index.php?body=score` | `/score` | `score.html` |
| `/index.php?body=verenigingen` | `/verenigingen` | `verenigingen.html` |
| `/index.php?body=contact` | `/contact` | `contact.html` |
| `/index.php?body=sitemap` | `/sitemap` | `sitemap.html` |
| `/index.php?body=disclaimer` | `/disclaimer` | `disclaimer.html` |

`index.php` and `index.php?body=begin` render the same content; they differ only in whether the
"De bar" tab is drawn as active. Both redirect to `/`.

## What changed in the conversion

The look is unchanged. Verified against the live site: the header is 110px tall in both, the
collage image is 980px wide in both, and all nine association logos render at identical sizes and
positions. What changed is how the page is built.

- **Four presentational images became CSS**, saving 192 KB: `bg.jpg` (a 1x8000px JPEG holding a
  gradient from `#fbd546` to `#f49408` over the first 200px, then flat), `kop_zwart.gif` and
  `rand_onder.gif` (black bars with 15px rounded corners) and `menu/links.gif` + `menu/rechts.gif`
  (the 15px white caps of the active tab). Colours and radii were sampled from the originals, so
  the result is the same pixels from a `linear-gradient` and `border-radius`.
- **`onclick="location.href=..."` navigation became real links.** The original had no `<a>` in its
  menu at all, so it could not be opened in a new tab, used with a keyboard, or followed by a
  crawler. This is also why `wget` finds nothing.
- **Inline styles moved to `css/site.css`**, which is what lets the strict CSP apply with no
  `'unsafe-inline'`.
- **Layout tables became CSS.** The association logos are a grid, the board lists stay real tables
  (they are tabular data) with one `<tbody>` per person in place of the original's spacer rows.
- **Made responsive.** The original was a fixed 1000px with no viewport meta, so a phone showed it
  zoomed out to illegibility. The desktop layout is untouched; below 720px the nav becomes
  full-width tabs and the logo grid drops to two columns, then one.

## Quirks

- **The homepage now marks "De bar" as the active tab.** The original was inconsistent here:
  `index.php?body=begin` highlighted the tab, but plain `index.php` rendered the same content
  with no tab highlighted. Both URLs now map to `/`, so one behaviour had to win; the highlighted
  one is what the tab was for.
- **No favicon.** `https://bunkerbar.nl/favicon.ico` returns 404, so the original site never had
  one. Not recreated by hand: that would be inventing brand identity for an archived site.
- **`images/achtergrond_pullen2.jpg` does not exist** (404). It is referenced only inside an HTML
  comment, as a commented-out alternative background, so nothing links to it.
- **The association links are still `http://`**, exactly as the original wrote them. Not silently
  upgraded to `https://`: several of these associations may no longer exist, and a forced upgrade
  would turn a redirect into a hard failure. They are links, not subresources, so nothing is
  loaded from them.
- **"blablabla" on the SCOrE page is in the original**, sitting under a commented-out note reading
  "stukje over de stichting en de activiteiten door de jaren heen". It is an unfinished placeholder
  that went live. Left as-is because the site is content-frozen; say so if you would rather it went.
- The site has no forms, no contact route and no interactivity at all. The contact page exists
  only to say that contact is no longer possible.

## Local

```bash
docker compose up --build -d bunkerbar
node tools/check-sites.mjs bunkerbar
tools/smoke.sh bunkerbar
```

Serves on <http://127.0.0.1:9820>.
