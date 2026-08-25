# Adding a site

The recipe for bringing a site into this repo. It assumes the site is small, static in
character, and currently hosted somewhere else (usually the legacy Plesk hosting).

If the site needs a database, a login, a form that sends mail, or a framework, **stop**: it does
not belong here. This repo is for sites that are files.

---

## 1. Scaffold

```bash
tools/new-site.sh <name> "<Title>" <primary-domain>
```

This creates `sites/<name>/` with the contract filled in and the next free port assigned
(the 9820 to 9899 range belongs to this repo; `community-cafe-web` already owns 9810 to 9813).

Then add the service to `docker-compose.yml` and `docker-compose.portainer.template.yml`, and
add a row to the site table in the root `README.md`. The scaffold script prints this list.

## 2. Snapshot the old site, and commit it unmodified

```bash
wget --mirror --page-requisites --no-parent --adjust-extension \
     --convert-links --directory-prefix=.snapshot https://<domain>/
```

Copy the result into `sites/<name>/public/` and **commit that as its own commit, before
changing anything.** The cleanup then shows up as a reviewable diff against the original, which
is the only way to be sure nothing was silently lost or invented.

`.snapshot/` is gitignored, so the scratch mirror stays out of the repo.

> The mirror only captures what is publicly linked. Unlinked pages, original uncompressed
> images and favicon sources may need pulling from Plesk over FTP. If something looks missing,
> say so rather than recreating it by hand.

## 3. Clean up, without changing how it looks

The goal is that the page looks the same to a visitor and is finally usable on a phone. Keep
the copy, colours, imagery and character exactly as they are.

- Semantic HTML: real `<header>`, `<nav>`, `<main>`, `<footer>`, headings in order. No `<font>`,
  no layout `<div>` soup, no `<center>`.
- Move every inline style into `public/css/site.css` and every inline script into a `.js` file.
  This is not optional: the CSP blocks inline styles and scripts, so `check-sites.mjs` fails
  the build on them.
- Replace `onclick="location.href=..."` navigation with real `<a href>`. It is what a link is
  for, it works with the keyboard and middle-click, and the CSP blocks the handler anyway.
- Add `<meta name="viewport" content="width=device-width, initial-scale=1">` and a `lang`
  attribute on `<html>`.
- Replace fixed pixel widths with a fluid `max-width` so the layout survives a 375px screen.
- Convert HTML entities (`&eacute;`) to real UTF-8 characters and declare `<meta charset="utf-8">`.
- Fix backslash paths (`\img\logo.png`) to forward slashes.
- Name pages after their clean URL: `score.html` is served at `/score`.

## 4. Self-host or remove every third-party asset

Fonts, stylesheets, icon sets and scripts must be served from the site itself. **Prefer removal
over self-hosting**: a page that uses a card grid and one carousel does not justify vendoring
jQuery plus a full CSS framework. A few dozen lines of CSS grid and vanilla JS is smaller,
faster, and has no supply chain.

If you self-host a font, check its licence allows it, and put it in `public/fonts/`.

## 5. Redirects

Every URL the old site served must keep working. List each one in `redirects.txt`:

```
# <old-path> <expected-location>
/index.php?body=score /score
/oude-pagina           /nieuwe-pagina
```

Then implement them in the site's `nginx.conf`. Path redirects are a `rewrite`; query-string
URLs need a `map` at http level, because `rewrite` cannot match a query string:

```nginx
map $arg_body $legacy_body {
    default  "/";
    score    "/score";
}

server {
    ...
    location = /index.php { return 301 $legacy_body; }
}
```

`tools/smoke.sh` asserts every line of `redirects.txt` against the running container, so the
two cannot drift apart unnoticed.

## 6. Favicon, robots, sitemap

Add `public/favicon.ico` (and a PNG or SVG if the original had one), `public/robots.txt`, and a
`public/sitemap.xml` listing the clean URLs. `public/404.html` is served by the shared config if
present; add one that matches the site's design.

## 7. Verify

```bash
node tools/check-sites.mjs <name>
docker compose up --build -d <name>
tools/smoke.sh <name>
```

Then the part no script can do: **open the container and the live site side by side**, at
desktop width and at 375px, page by page. Check copy, imagery, colours, spacing and layout.
Design parity against the live site is the acceptance criterion.

## 8. Ship

Bump `version` in `site.json`, open a PR, and after merge approve the publish gate. Then deploy
per [`migration-checklist.md`](migration-checklist.md).
