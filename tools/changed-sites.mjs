#!/usr/bin/env node
/**
 * Work out which sites need rebuilding, from the git diff against a base ref.
 *
 *   node tools/changed-sites.mjs <base-ref>
 *
 * Deliberately not dorny/paths-filter: that needs a filter entry per site, so adding a
 * site would mean editing the workflow. This needs no configuration at all.
 *
 * Anything shared (shared/, tools/, .github/, the compose files) rebuilds every site,
 * because it changes every image. An unusable or missing base ref also rebuilds
 * everything, which is the safe direction to fail in.
 *
 * Writes `sites=<json array>` and `any=true|false` to $GITHUB_OUTPUT when running in
 * Actions, and always prints a human-readable summary to stderr.
 */

import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const SITES_DIR = join(ROOT, 'sites')

// A change to any of these affects every image, so every site is rebuilt.
const GLOBAL_PATHS = [/^shared\//, /^tools\//, /^\.github\//, /^docker-compose[^/]*\.yml$/, /^\.dockerignore$/]

const allSites = existsSync(SITES_DIR)
  ? readdirSync(SITES_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
  : []

function changedFiles(baseRef) {
  if (!baseRef || /^0{40}$/.test(baseRef)) return null
  try {
    const out = execFileSync('git', ['diff', '--name-only', `${baseRef}...HEAD`], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return out.split('\n').filter(Boolean)
  } catch {
    return null
  }
}

function main() {
  const baseRef = process.argv[2]
  const files = changedFiles(baseRef)

  let sites
  let reason
  if (files === null) {
    sites = allSites
    reason = `no usable base ref (${baseRef ?? 'none given'}), rebuilding everything`
  } else if (files.some((f) => GLOBAL_PATHS.some((re) => re.test(f)))) {
    sites = allSites
    reason = 'a shared file changed, rebuilding everything'
  } else {
    const touched = new Set()
    for (const file of files) {
      const m = file.match(/^sites\/([^/]+)\//)
      if (m && allSites.includes(m[1])) touched.add(m[1])
    }
    sites = [...touched].sort()
    reason = `${files.length} changed file(s)`
  }

  console.error(`changed-sites: ${reason} -> ${sites.length ? sites.join(', ') : '(none)'}`)

  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `sites=${JSON.stringify(sites)}\nany=${sites.length > 0}\n`,
    )
  }
  console.log(JSON.stringify(sites))
}

main()
