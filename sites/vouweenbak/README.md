# Vouw een bak

Static site for **vouweenbak.nl**, the bakvouw leaderboard of Hubble Community: 601 personal
records, the rules that govern them, the statistics behind them, and the duck count per
vereniging.

`"status": "archive"`, which is the point of this migration. A new version of the site is being
built elsewhere; until it lands, this keeps the existing one online in a form that needs no
database, no PHP and no maintenance. The content is frozen: fix bugs and security issues, do not
edit the times.

## Origin

Migrated from WordPress 7.1.1 (theme: JointsWP-CSS-master, Foundation 6.4) on the legacy hosting,
in September 2026. Every page was crawled from the live site and converted; nothing was
retyped.

The site had **no interactivity to lose**. Every leaderboard, table and record page was rendered
server-side into plain HTML: no AJAX, no `admin-ajax.php`, no search on any real page, and no
forms anywhere (comments were closed, `comment_status: "closed"` on all but two scores). Adding
a bakvouwtijd was done in wp-admin, which is exactly the part that is not coming back.

```bash
curl -sS https://vouweenbak.nl/wp-sitemap.xml   # 9 pages, 601 bakvouwtijden, 6 stubs
curl -sS https://vouweenbak.nl/tijd/leon/       # one record, fully server-rendered
```

## The notice

Every page carries a bar at the top of the header:

> A new version of this site is being built and hence the content of the site may be incorrect.
> This leaderboard is no longer updated.

It is the header's first child on purpose. The header is `position: fixed`, so a bar in normal
flow above it would scroll away underneath. Its height is fixed rather than driven by the text,
and `.off-canvas-content` carries the same value as `padding-top`. Those two numbers are a pair:
the page starts exactly as far down as the notice is tall, which is what keeps the wordmark off
the hero heading the way it was before the bar existed.

Each step reserves the tallest the text can get anywhere in that range, measured rather than
guessed: `3.9rem` for three lines down to a 320px screen, `2.9rem` for two from 40em, `2rem` for
one from 64em. The text stops wrapping at around 900px, so 64em has room to spare. Where the
text is shorter than the reserve, the bar simply has it centred in it. **Changing the wording
means re-checking those three numbers**, at 320px, at 640px and at 1024px.

## Page map

| Old URL | New URL | Notes |
|---------|---------|-------|
| `/` | `/` | Season 2 leaderboard, 332 entries |
| `/records/` | `/records` | All-time leaderboard, all 601 |
| `/stats/` | `/stats` | Statistics, Halve Leo's, ICE, Oktoberfest |
| `/regels/` | `/regels` | Bakvouwdelijk Reglement, revisie 1.002 |
| `/eendjes/` | `/eendjes` | Duck count per vereniging |
| `/changelog/` | `/changelog` | |
| `/privacybeleid/` | `/privacybeleid` | |
| `/tijd/<naam>/` | `/tijd/<naam>` | 601 of them |
| `/bakfiets/` | `https://vouweenbakfiets.nl/` | that page is [its own site](../vouweenbakfiets/README.md) now |
| `/vereniging/<naam>/` | `/eendjes` | six stubs with a title and nothing else, linked only from the sitemap |
| `/voorbeeld-pagina/` | `/` | WordPress' sample page; it rendered "Post Not Found" on the live site |
| `/feed/`, `/comments/feed/`, `/wp-json/*`, `/author/*`, `/wp-admin/*`, `/wp-login.php`, `/xmlrpc.php` | `/` | |
| `/wp-content/uploads/<jaar>/<maand>/<file>` | `/img/<file>` | names unchanged, tree gone |
| `/wp-sitemap*.xml` | `/sitemap.xml` | |

Every other old URL was a page URL with a trailing slash, and `nginx.conf` normalises those to
the slashless clean URL. See the comment at the top of that file for why the normaliser is a
regex location rather than the server-level `rewrite` the other sites use.

## What the original loaded from third parties

| Resource | Used for | Verdict |
|----------|----------|---------|
| Google Fonts: Roboto | the body text | self-hosted, `fonts/roboto-latin*.woff2` |
| Google Fonts: Sriracha | the names in the leaderboard | self-hosted, `fonts/sriracha-latin.woff2` |
| Google Charts (`gstatic.com`), on 135 record pages | the "Bakvouw Historie" line chart | replaced by an inline `<svg>`, see below |
| `s.w.org` emoji images, plus the emoji detection script | nothing: the two emoji in nicknames render fine in the system font | dropped |

Only the latin subset of each font ships. The only characters on the site outside it are two
emoji in nicknames, which no text font would have drawn anyway.

## The record history chart

135 pages showed how someone's time came down over the years, drawn by Google Charts from data
that was already in the page. The data now goes straight into an inline `<svg>` at conversion
time: same series, same amber (`#fbb03b`), same axis titles, no third-party request, no
JavaScript, and it works with the strict CSP because it uses presentation attributes and classes
rather than `style=""`.

**Seven of those charts never worked.** WordPress emitted a row with a date and no value
(`[new Date('2021-09-10'),]`), which made Google Charts throw and draw nothing at all, so those
pages showed an empty box. The valueless rows are dropped and the rest of the series is drawn:
`christopher-b`, `jan-e`, `kyo-van-k`, `marjolein-wervydays`, `patrick-s`, `renske`,
`stefan-h-innovum`.

## What the CSP forced out of the markup

`shared/nginx/headers.conf` has no `'unsafe-inline'`, and WordPress is built on it. All of this
moved into files, with no change to the rendering:

- **Eight `<style>` blocks per page.** They are `css/wp-base.css`, `css/wp-blocks.css` and
  `css/wp-theme.css`, split exactly where the cascade needs them: the single bakvouwtijden and
  the 404 page never loaded the block CSS, and they must not start now, because
  `.wp-block-cover` becomes a centring flexbox there and would push the glasses down the page.
- **939 `style="font-family: Arial"` attributes**, one on the `>` after every time in the two
  leaderboards, plus a `style="background-color: #222"` on each of the 601 record pages and
  eleven page covers carrying their background and measured height inline. All of them are
  classes in `css/site.css` now, each carrying the exact declarations it replaced.
- **The glass drain animation**, which WordPress wrote out per page with the time compiled into
  a jQuery call. The time is a `data-drain` attribute on the glass and `js/site.js` reads it.
  Same easing, same duration, now with a `prefers-reduced-motion` path.

jQuery and Foundation stay, self-hosted: the off-canvas menu on small screens is theirs. The
theme's `scripts.js` did not survive, because two thirds of it operated on markup this site has
never had (Foundation accordions, YouTube and Vimeo embeds).

## Quirks

- **The times used to need JavaScript.** `style.css` hides each one until the drain animation
  finishes, so on the live site a visitor without JavaScript saw four full glasses and no times
  at all. `css/noscript.css`, loaded from a `<noscript>`, puts the times back.
- **Two filenames contain an emoji.** `tijd/frederik-🤴.html` and `tijd/yvar-🔥.html`. Their old
  URLs are percent-encoded, and nginx decodes the path before it looks for a file, so the file
  has to carry the emoji itself for `/tijd/frederik-%f0%9f%a4%b4` to keep working. It does;
  `tools/smoke.sh` and the container both confirm it.
- **The 32×32 favicon is missing from the original.** `cropped-vouwbak1-32x32.png` is referenced
  in every page's head on the live site and **404s there**. The 180, 192 and 270 crops exist and
  are here. The reference is gone rather than recreated; if the file turns up on the old host,
  drop it in `img/` and add the link back.
- **Two scores still had comments open** (`amy-k`, `jolijn-m`) and showed a "Login om te reageren"
  link and a reply form. Nothing on this site takes input, so those are gone. The comments
  themselves, on 25 pages, are untouched.
- **The footer disclaimer was centred by accident.** `style.css` lays the widget area out as
  three columns, and the live site filled it with two empty text widgets so "Geen 18, geen
  alcohol" landed in the middle one. It is one column and a centred line now, which puts it in
  the same place without the empty elements.
- **Italics are real now.** The original asked Google Fonts for Roboto's normal weights only, so
  every `<em>` on the site was a faux-oblique the browser slanted itself. The self-hosted set
  includes the italic file, so italic text is drawn in Roboto Italic and runs very slightly
  narrower.
- **The privacy policy is WordPress' boilerplate**, and it describes comments, Gravatar and
  cookies that this site does not have. Kept verbatim for now, deliberately.
- The site is content-frozen but the old one was not: the changelog's newest entry is dated
  2026-09-21, the day of the crawl.

## Local

```bash
docker compose up --build -d vouweenbak
node tools/check-sites.mjs vouweenbak
tools/smoke.sh vouweenbak
```

Serves on <http://127.0.0.1:9824>.
