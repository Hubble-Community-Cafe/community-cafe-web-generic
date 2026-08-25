# Vouweenbakfiets

Static site for **vouweenbakfiets.nl**, a one-page site about the bakfiets that Hubble
Community lends out.

## Origin, and why this one is different

The other sites here were migrations. This one is a **de-framing**: vouweenbakfiets.nl was never
a site of its own.

What it served was 202 bytes of this:

```html
<FRAMESET>
<FRAME SRC="https://vouweenbak.nl/bakfiets/" NORESIZE>
<NOFRAMES>Your browser does not support frames.</NOFRAMES>
</FRAMESET>
```

A `<frameset>` cloak: the browser showed `vouweenbak.nl/bakfiets/` while the address bar kept
saying vouweenbakfiets.nl. `<frameset>` was removed from the HTML standard years ago, and the
framed page would be a third-party request besides, so it could not survive this repo's rules
in any form.

The framed page was itself a WordPress page on vouweenbak.nl, dressed up to look like a separate
site with two hacks:

- **Inline CSS** hiding the theme's navigation and footer sidebar
  (`.top-bar-right{display:none}`, `.footersidebar{display:none}`).
- **Inline jQuery** rewriting `document.title` to "Vouweenbakfiets", appending " fiets" to the
  site name in the header, and swapping the logo image.

This site is that rendered result, rebuilt as a page that actually is what it claims to be. None
of the hacks are needed once it stands on its own: the title is just the title, the wordmark is
just markup, and there is no nav to hide.

## Page map

| Old URL | New URL | Notes |
|---------|---------|-------|
| `/` | `/` | was the frameset, now the page itself |
| `/index.html` | `/index.html` | still a 200, not redirected, see `nginx.conf` |

Content source: `https://vouweenbak.nl/bakfiets/`.

## What changed

The rendered layout is reproduced from measurements taken off the live page: 768px content
column, 400px minimum hero height, 36px hero title, 16px/1.6 body, and the colours `#dfe6e9`
(page), `#2c3e50` (hero overlay at 70%), `#0a0a0a` (text), `#abb8c3` (the asterisk and the
footnote) and `#1779ba` (links).

- **No JavaScript.** The jQuery that faked the page's identity has nothing left to do.
- **No third-party requests.** The original pulled Roboto and Sriracha from Google Fonts.
  Roboto is now self-hosted from `public/fonts/` (Apache License 2.0, latin subset, variable
  weight, one file for upright and one for italic). **Sriracha was not used by a single element
  on the page** and is simply gone.
- **The theme's navigation is not reproduced.** It was already hidden on this page by the inline
  CSS above, so it is not a visual change. Every item pointed at vouweenbak.nl, which is what
  this site is being separated from. The one item that pointed here, "Fiets", still works from
  vouweenbak.nl's own menu.
- **The wordmark links to `/` instead of vouweenbak.nl**, which is the point of the exercise.
- WordPress's ~50 KB of inline block-library CSS is gone; the whole page is now one small
  stylesheet.

## Quirks

- **"verengingseigendomen" is a typo in the original** (for "verenigingseigendommen"). Kept
  verbatim. This site is `"status": "live"`, so fix it whenever you like, with a version bump.
- **The wordmark still reads "Vouw een bak fiets"**, spaced, because that is what the live page
  renders (the site name plus the " fiets" the jQuery appended). The hero and the page title use
  "Vouweenbakfiets" as one word. That inconsistency is the original's and was left alone.
- **The declared favicon was broken.** The page pointed at `cropped-vouwbak1-32x32.png`, which
  404s; the 512x512 original does exist and is used instead.
- **The alcohol notice is not on this page.** "Geen 18, geen alcohol" lives in the theme's
  `.footersidebar`, which this page hides, so it never rendered here.
- **This domain sits on the same Plesk host as heeftdaanzijnbacheloralgehaald.nl**
  (`94.130.182.172`), not the one bunkerbar was on.
- **`www` works over HTTPS today.** Make sure the Nginx Proxy Manager host covers both
  `vouweenbakfiets.nl` and `www.vouweenbakfiets.nl` before cutting over.

## Follow-up for the owner

After cutover there will be two copies of this content: this site, and the WordPress page at
`vouweenbak.nl/bakfiets/` it was copied from. Decide what that page should do. Redirecting it to
vouweenbakfiets.nl is the tidiest option, and would also let the inline CSS and jQuery hacks be
deleted from it. That is a change on vouweenbak.nl, which is not in this repo.

## Local

```bash
docker compose up --build -d vouweenbakfiets
node tools/check-sites.mjs vouweenbakfiets
tools/smoke.sh vouweenbakfiets
```

Serves on <http://127.0.0.1:9823>.
