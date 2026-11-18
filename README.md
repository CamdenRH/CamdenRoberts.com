# camdenroberts.com

My personal portfolio website, built to showcase my software engineering projects, technical and educational experience, and resume.

The frontend uses HTML, CSS, and vanilla JavaScript, developed with AI assistance. The contact form uses a custom-built TypeScript API
running on Cloudflare Pages Functions, with server-side input validation and Cloudflare Turnstile verification.

## Running locally

**Requirements:** Node.js and npm.

Install dependencies:
`npm install`

Start the local development server:
`npx wrangler pages dev public`

The site will be available at http://localhost:8788

The contact API requires a TURNSTILE_SECRET_KEY environment variable. For local development, copy .dev.vars.example to .dev.vars and 
configure the appropriate Turnstile testing secret.

## Testing

Unit tests are written using Vitest and are built to cover input validation, normalization, request-body handling, and API behavior.
```powershell
npx tsc --noEmit
npx vitest run
```

HTTP integration tests are also available in tests/tests.ps1 and require the local Wrangler server to be running.

## Project Structure

```text
public/     Static HTML, CSS, JavaScript, and assets
function/   Cloudflare Pages Functions and backend utilities
tests/      Vitest unit tests and HTTP integration tests
```

## Deployment

The site is designed for Cloudflare Pages, using public as the output directory and functions for server-side API routing.

Production environment secrets are configured through Cloudflare rather than stored in the repo.

## Status

This website and contact API are under active development. Input validation and Turnstile verification have been implemented; email 
delivery and production rate limiting are now finished and the contact form is fully operational.