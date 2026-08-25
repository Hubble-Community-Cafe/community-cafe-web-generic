# Migration checklist

Taking one site off the legacy Plesk hosting and pointing its domain at the container. Do this
per site, one at a time, and let each one settle before starting the next.

The content work is [`adding-a-site.md`](adding-a-site.md). This document is only the cutover.

---

## Before the day

### 1. The site is genuinely ready

- [ ] `node tools/check-sites.mjs <site>` passes
- [ ] `tools/smoke.sh <site>` passes against the container
- [ ] Side-by-side parity check done against the live site, desktop and 375px
- [ ] Every legacy URL is in `redirects.txt` and asserted green
- [ ] The image is published to GHCR and the version is tagged

### 2. Inventory what else the domain does

This is the step that bites. A domain on shared hosting is rarely just a website.

- [ ] **Email.** Does the domain have mailboxes or forwarders on Plesk? Moving the A record does
      not touch MX, but decommissioning the hosting later will kill the mail. Write down every
      mailbox and forwarder before you cancel anything.
- [ ] **Subdomains.** Anything else under this domain still on the old host?
- [ ] **DNS records** other than A/AAAA: MX, TXT (SPF, DKIM, DMARC, domain verification), CNAMEs.
      Screenshot the current zone. Only the A/AAAA records change.
- [ ] **Certificates.** The old host's Let's Encrypt certificate becomes irrelevant; Nginx Proxy
      Manager issues a new one. Nothing to migrate, but the new one must be issued *after* DNS
      moves, so expect a short window where only HTTP works.

### 3. Lower the TTL, at least 24 hours ahead

TTL is rollback speed. At a 24 hour TTL, reverting takes a day; at 300 seconds it takes minutes.

- [ ] Set the TTL to 300 on the A (and AAAA, and `www`) records for the domain
- [ ] Do this **at least 24 hours before** the cutover, so the old long TTL has expired everywhere
      by the time you might need it

---

## Deploy

### 4. Add the service to the Portainer stack

- [ ] Copy the site's block from `docker-compose.portainer.template.yml` into the stack, pin the
      version tag, redeploy
- [ ] Confirm the container is healthy and answering on its port

### 5. Proxy a temporary hostname first

- [ ] In Nginx Proxy Manager, point a temporary hostname (for example `new.<domain>`) at the
      container port, with a certificate
- [ ] Run `tools/smoke.sh <site> https://new.<domain>` against it
- [ ] Walk the site once more in a browser over real HTTPS

---

## Cut over

### 6. Move the A record

- [ ] Point the apex A record (and `www`, and AAAA if used) at the Portainer host
- [ ] Leave MX and TXT records untouched

### 7. Add the real hostnames in Nginx Proxy Manager

- [ ] Add both `<domain>` and `www.<domain>` to the proxy host
- [ ] Issue the certificate (this needs DNS to have propagated)
- [ ] Redirect `www` to the apex, or the other way round, matching what the old site did

### 8. Verify

- [ ] `tools/smoke.sh <site> https://<domain>` passes
- [ ] Every legacy URL 301s correctly over the public hostname, not just locally
- [ ] HTTPS is valid and HTTP redirects to it
- [ ] The site renders correctly on a real phone
- [ ] Search for the domain and click the top few results; those are the URLs that must not break

### 9. Monitor

- [ ] Add an Uptime Kuma monitor for the domain
- [ ] Raise the DNS TTL back to its normal value once the cutover has been stable for a day

---

## After

### 10. Keep the rollback for two weeks

- [ ] **Do not touch the Plesk hosting.** It is the rollback: dropping the TTL and repointing the
      A record puts the old site back in minutes.
- [ ] Watch the Uptime Kuma monitor and the NPM access logs for 404s on URLs you did not
      anticipate. Each one is a missing line in `redirects.txt`.

### 11. Decommission

Only after two stable weeks, and only once the email inventory from step 2 is resolved.

- [ ] Take a final full backup of the Plesk site and store it off that host
- [ ] Move or wind down any mailboxes and forwarders on the domain
- [ ] Cancel the hosting

---

## Rollback

At any point before decommissioning: repoint the A record back at the old host. With a 300
second TTL this is effective within minutes. Nothing else needs undoing, because nothing about
the cutover changes any data: these sites are read-only files.
