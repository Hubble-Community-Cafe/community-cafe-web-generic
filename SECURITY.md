# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release per site | Yes |
| Older releases | No |

Each site is versioned and released independently. We only address security issues in the
latest release of a given site.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report vulnerabilities privately by emailing **pim@hubble.cafe**. Include:

- A description of the vulnerability
- Steps to reproduce or a proof of concept
- The affected site (and its domain)
- Any potential impact you've identified

### What to Expect

- **Acknowledgement** within 3 business days
- **Status update** within 10 business days
- We will work with you to understand and resolve the issue before any public disclosure

### Scope

This policy covers the site content and container configuration in this repository. The sites
here are static: they serve files, accept no input, hold no user data and set no cookies. For
infrastructure or hosting issues, contact pim@hubble.cafe directly.

## Security Posture

- Containers run as the non-root `nginx` user and serve read-only content.
- A strict Content-Security-Policy with no `'unsafe-inline'` and no external origins is applied
  to every response (`shared/nginx/headers.conf`), alongside `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, a referrer policy and a permissions policy.
- No third-party resources of any kind are loaded, so there is no supply chain in the browser.
- Base images are patched on build (`apk upgrade`) and tracked by Dependabot; published images
  are scanned with Trivy.

## Security Best Practices for Contributors

- Never commit secrets, API keys, or credentials
- Never commit `.env` files
- Never loosen the CSP to make something work; move the inline style or script into a file
- Never add a third-party script, font, stylesheet or icon set
