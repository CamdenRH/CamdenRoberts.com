# Camden Roberts-Hurd — Engineering Portfolio

A static, responsive portfolio website. No build tools or package installation required.

## Preview locally

From this folder, run `python -m http.server 8000`, then open `http://localhost:8000`. Opening `index.html` directly also works for most content.

## Deploy

1. Review all text and links and confirm you want the current documents publicly downloadable.
2. Create a GitHub repository for the site, upload its contents (or push with Git).
3. Connect the repository to Cloudflare Pages or Netlify. Because this is plain HTML/CSS, select no build command and publish the repository root.
4. Add `camdenroberts.com` as a custom domain in your hosting provider and follow its exact DNS records in Squarespace Domains. Keep existing email-related MX/TXT records untouched.
5. Enable HTTPS, and add a `www` redirect if desired.

**No DNS records have been changed.**

## Content guidelines

- White Lightning: authored PCB and most controller firmware; team vehicle prototype.
- CatScript: independent compiler implementation, instructor-supplied starter setup and tests. Check university sharing rules before publishing source.
- FiniteWorlds: project foundation, requirements, direction, and manual validation by Camden; most Java implementation AI-generated.
- Project photography and source files remain local; the site includes the original supplied PCB render.
- Update contact information and review personal documents before deploying publicly.
