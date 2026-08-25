#!/usr/bin/env node
/**
 * Static checks for every site in sites/.
 *
 * Dependency-free on purpose: this repo has no package.json and no build step, so the
 * checks must run with nothing but a Node binary. Run it before every commit:
 *
 *   node tools/check-sites.mjs           all sites
 *   node tools/check-sites.mjs bunkerbar one site
 *
 * What it enforces:
 *   1. The site.json contract (name, version, unique port, required files).
 *   2. No third-party subresources. This is the privacy rule, checked at the source.
 *   3. Nothing that the strict CSP would block at runtime (inline style/script/handlers).
 *   4. Every internal link and asset reference resolves to a file that exists.
 *   5. Every page has a <title> and a viewport meta.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const SITES_DIR = join(ROOT, 'sites')

const PORT_MIN = 9820
const PORT_MAX = 9899
const REQUIRED_FILES = ['site.json', 'Dockerfile', 'nginx.conf', 'public/index.html']
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SEMVER_RE = /^\d+\.\d+\.\d+$/
const STATUSES = new Set(['live', 'archive'])

// Routes nginx serves that have no file behind them (shared/nginx/static-site.conf).
const VIRTUAL_ROUTES = new Set(['/health'])

// <link rel="..."> values that actually fetch something. rel="canonical" and friends
// name a URL without requesting it, so they are not subresources.
const FETCHING_REL = /\b(stylesheet|icon|apple-touch-icon|mask-icon|manifest|preload|prefetch|preconnect|dns-prefetch)\b/i

const errors = []
const fail = (site, file, message) =>
  errors.push({ site, file: file ? relative(ROOT, file) : null, message })

/** Recursively list files under `dir` whose name matches `test`. */
function walk(dir, test, found = []) {
  if (!existsSync(dir)) return found
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, test, found)
    else if (test(entry.name)) found.push(full)
  }
  return found
}

/** Pull attributes out of a single tag string, lowercasing the names. */
function attributes(tag) {
  const attrs = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let m
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
  return attrs
}

const isExternal = (url) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url)
const isIgnorable = (url) =>
  !url.trim() || /^(?:#|data:|mailto:|tel:|javascript:|blob:)/i.test(url.trim())

/** srcset is a comma-separated list of "url descriptor" pairs. */
const srcsetUrls = (value) =>
  value
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)

/**
 * Collect every URL an HTML document references, split by whether the browser fetches it.
 * A plain <a href> to another website is a link, not a request, so it is allowed; a
 * stylesheet or image from a CDN is not.
 */
function collectHtmlRefs(html) {
  const subresources = []
  const links = []

  for (const tag of html.match(/<[a-zA-Z][^>]*>/g) ?? []) {
    const name = tag.match(/^<([a-zA-Z][-a-zA-Z0-9]*)/)[1].toLowerCase()
    const attrs = attributes(tag)

    if (name === 'a' || name === 'area') {
      if (attrs.href) links.push(attrs.href)
      continue
    }
    if (name === 'link') {
      if (attrs.href && FETCHING_REL.test(attrs.rel ?? '')) subresources.push(attrs.href)
      continue
    }
    if (name === 'form') {
      if (attrs.action) links.push(attrs.action)
      continue
    }
    for (const attr of ['src', 'poster', 'data']) {
      if (attrs[attr]) subresources.push(attrs[attr])
    }
    if (attrs.srcset) subresources.push(...srcsetUrls(attrs.srcset))
  }

  return { subresources, links }
}

/** url(...) and @import in a stylesheet or a <style> block. */
function collectCssRefs(css) {
  const refs = []
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) refs.push(m[2].trim())
  for (const m of css.matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/gi)) refs.push(m[1].trim())
  return refs
}

/**
 * Resolve a reference the way nginx would, given shared/nginx/static-site.conf's
 * `try_files $uri $uri.html $uri/`.
 */
function resolves(ref, file, publicDir) {
  const clean = ref.split('#')[0].split('?')[0]
  if (!clean) return true
  if (VIRTUAL_ROUTES.has(clean)) return true

  const base = clean.startsWith('/')
    ? join(publicDir, decodeURIComponent(clean))
    : join(dirname(file), decodeURIComponent(clean))

  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return true
  }
  return existsSync(base) && statSync(base).isDirectory()
}

function checkReferences(site, file, publicDir, subresources, links) {
  for (const ref of subresources) {
    if (isIgnorable(ref)) continue
    if (ref.includes('\\')) {
      fail(site, file, `backslash in path "${ref}", use forward slashes`)
      continue
    }
    if (isExternal(ref)) {
      fail(site, file, `third-party subresource "${ref}", self-host it instead`)
      continue
    }
    if (!resolves(ref, file, publicDir)) fail(site, file, `broken reference "${ref}"`)
  }

  // Links may point anywhere off-site; only internal ones have to resolve.
  for (const ref of links) {
    if (isIgnorable(ref) || isExternal(ref)) continue
    if (ref.includes('\\')) {
      fail(site, file, `backslash in link "${ref}", use forward slashes`)
      continue
    }
    if (!resolves(ref, file, publicDir)) fail(site, file, `broken link "${ref}"`)
  }
}

/** Anything the CSP in shared/nginx/headers.conf would block at runtime. */
function checkCspCompatibility(site, file, html) {
  const inlineStyleBlocks = html.match(/<style\b[^>]*>/gi) ?? []
  if (inlineStyleBlocks.length) {
    fail(site, file, `${inlineStyleBlocks.length} inline <style> block(s), the CSP blocks these; move to a .css file`)
  }

  const styleAttrs = html.match(/\sstyle\s*=\s*["'][^"']*["']/gi) ?? []
  if (styleAttrs.length) {
    fail(site, file, `${styleAttrs.length} inline style="" attribute(s), the CSP blocks these; move to a .css file`)
  }

  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!attributes(tag).src) {
      fail(site, file, 'inline <script>, the CSP blocks it; move to a .js file')
      break
    }
  }

  const handlers = html.match(/\son[a-z]+\s*=\s*["'][^"']*["']/gi) ?? []
  if (handlers.length) {
    const names = [...new Set(handlers.map((h) => h.trim().split(/\s*=/)[0]))].join(', ')
    fail(site, file, `inline event handler(s) (${names}), the CSP blocks these; use addEventListener in a .js file`)
  }
}

function checkDocument(site, file, html) {
  if (!/<title>\s*\S/i.test(html)) fail(site, file, 'missing a non-empty <title>')
  if (!/<meta\s[^>]*name\s*=\s*["']viewport["']/i.test(html)) {
    fail(site, file, 'missing <meta name="viewport">, the page will not work on mobile')
  }
  if (!/<html\b[^>]*\slang\s*=/i.test(html)) fail(site, file, 'missing lang attribute on <html>')
}

function checkRedirects(site, dir) {
  const file = join(dir, 'redirects.txt')
  if (!existsSync(file)) return
  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, '').trim()
    if (!line) return
    const parts = line.split(/\s+/)
    if (parts.length !== 2) {
      fail(site, file, `line ${i + 1}: expected "<old-path> <expected-location>", got "${line}"`)
      return
    }
    const [from, to] = parts
    if (!from.startsWith('/')) fail(site, file, `line ${i + 1}: old path "${from}" must start with /`)
    if (!to.startsWith('/') && !isExternal(to)) {
      fail(site, file, `line ${i + 1}: target "${to}" must be an absolute path or a full URL`)
    }
  })
}

function loadSite(name, seenPorts) {
  const dir = join(SITES_DIR, name)

  for (const rel of REQUIRED_FILES) {
    if (!existsSync(join(dir, rel))) fail(name, join(dir, rel), 'required file is missing')
  }

  const manifestPath = join(dir, 'site.json')
  if (!existsSync(manifestPath)) return null

  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (err) {
    fail(name, manifestPath, `invalid JSON: ${err.message}`)
    return null
  }

  if (manifest.name !== name) {
    fail(name, manifestPath, `name "${manifest.name}" does not match its directory "${name}"`)
  }
  if (!NAME_RE.test(name)) fail(name, manifestPath, 'directory name must be lowercase kebab-case')
  if (!SEMVER_RE.test(manifest.version ?? '')) {
    fail(name, manifestPath, `version "${manifest.version}" must be MAJOR.MINOR.PATCH`)
  }
  if (!manifest.title) fail(name, manifestPath, 'missing "title"')
  if (!Array.isArray(manifest.domains) || manifest.domains.length === 0) {
    fail(name, manifestPath, 'missing "domains" (at least one)')
  }
  if (!STATUSES.has(manifest.status)) {
    fail(name, manifestPath, `status must be one of: ${[...STATUSES].join(', ')}`)
  }

  const port = manifest.port
  if (!Number.isInteger(port) || port < PORT_MIN || port > PORT_MAX) {
    fail(name, manifestPath, `port must be an integer between ${PORT_MIN} and ${PORT_MAX}`)
  } else if (seenPorts.has(port)) {
    fail(name, manifestPath, `port ${port} is already used by "${seenPorts.get(port)}"`)
  } else {
    seenPorts.set(port, name)
  }

  return manifest
}

function checkSite(name, seenPorts) {
  const dir = join(SITES_DIR, name)
  const publicDir = join(dir, 'public')

  loadSite(name, seenPorts)
  checkRedirects(name, dir)

  for (const file of walk(publicDir, (f) => /\.html?$/i.test(f))) {
    const html = readFileSync(file, 'utf8')
    const { subresources, links } = collectHtmlRefs(html)
    checkReferences(name, file, publicDir, subresources, links)
    checkCspCompatibility(name, file, html)
    checkDocument(name, file, html)
  }

  for (const file of walk(publicDir, (f) => /\.css$/i.test(f))) {
    const refs = collectCssRefs(readFileSync(file, 'utf8'))
    checkReferences(name, file, publicDir, refs, [])
  }
}

function main() {
  if (!existsSync(SITES_DIR)) {
    console.log('No sites/ directory yet, nothing to check.')
    return
  }

  const all = readdirSync(SITES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()

  const requested = process.argv.slice(2)
  const unknown = requested.filter((n) => !all.includes(n))
  if (unknown.length) {
    console.error(`Unknown site(s): ${unknown.join(', ')}`)
    console.error(`Known sites: ${all.join(', ') || '(none)'}`)
    process.exit(2)
  }

  // Ports must be unique across ALL sites, so always load every manifest even when
  // only one site was requested.
  const seenPorts = new Map()
  for (const name of all) {
    if (requested.length && !requested.includes(name)) loadSite(name, seenPorts)
    else checkSite(name, seenPorts)
  }

  if (all.length === 0) {
    console.log('No sites yet, nothing to check.')
    return
  }

  if (errors.length === 0) {
    const checked = requested.length ? requested : all
    console.log(`OK: ${checked.length} site(s) passed (${checked.join(', ')})`)
    return
  }

  let currentSite = null
  for (const { site, file, message } of errors) {
    if (site !== currentSite) {
      console.error(`\n${site}`)
      currentSite = site
    }
    console.error(`  ${file ? `${file}: ` : ''}${message}`)
  }
  console.error(`\n${errors.length} problem(s) found.`)
  process.exit(1)
}

main()
