# Frontend Content Security Policy (CSP)

This document describes the CSP directives, the nonce injection approach (Issue #31), and how to configure them for development and production.

## Production

### Nonce injection (Issue #31)

`frontend/vite.config.ts` registers `cspNoncePlugin()` for production builds.
The plugin:

1. Generates a cryptographically random 16-byte base64 nonce (`crypto.randomBytes(16).toString('base64')`) once per build.
2. Injects `nonce="<value>"` onto every inline `<script>` and `<style>` tag in `dist/index.html`.
3. Embeds a `<meta name="csp-nonce" content="<value>">` tag in `<head>`.
4. Installs a runtime patch (injected into the bundle) that reads the nonce from `<meta name="csp-nonce">` and applies it to every `<style>` element injected dynamically after page load (CSS-in-JS, lazy-loaded styles, etc.). The patch wraps `document.createElement`, `Node.prototype.appendChild`/`insertBefore`, and `CSSStyleSheet` insertion so any `<style>` tag created at runtime receives the build nonce before it is attached to the DOM.

The server-side edge function (Lambda@Edge or CloudFront Function) **must** read the nonce from the `<meta name="csp-nonce">` tag and echo it into the `Content-Security-Policy` response header before serving the HTML, replacing the `{{NONCE}}` placeholder defined in `PRODUCTION_CSP_TEMPLATE` (exported from `vite.config.ts`).

#### Lambda@Edge example (Node.js)

```js
const html = response.body;
const match = html.match(/<meta name="csp-nonce" content="([^"]+)">/);
const nonce = match ? match[1] : '';
const csp = PRODUCTION_CSP_TEMPLATE.replace(/\{\{NONCE\}\}/g, nonce);
response.headers['content-security-policy'] = [{ key: 'Content-Security-Policy', value: csp }];
```

#### `unsafe-inline` removal

`'unsafe-inline'` is intentionally absent from both `script-src` and `style-src` in the production template. Inline scripts and styles without a matching nonce will be blocked.

`style-src` uses `'nonce-{{NONCE}}'` instead of `'unsafe-inline'`. Because the runtime patch (step 4 above) applies the same build nonce to dynamically injected `<style>` tags, CSS-in-JS and other runtime style injection continue to work without weakening the policy.

#### Stellar SDK Web Workers

The Stellar SDK spawns workers from `blob:` URLs. The production CSP includes `worker-src blob:` to allow this without requiring `'unsafe-inline'` in `script-src`.

### CSP violation reporting

The production policy includes `report-uri /api/csp-report`. Configure an API Gateway or Lambda endpoint at that path to collect violation reports. Reports are retained in CloudWatch for 14 days (see Terraform configuration).

To enable report-only mode during rollout, add the same policy under the `Content-Security-Policy-Report-Only` header and collect violations before enforcing.

### Terraform

CloudFront responses receive the CSP from Terraform's response headers policy. Do not use a CSP meta tag: it cannot enforce `frame-ancestors` and is no longer present in `frontend/index.html`.

## Development (Vite)

Vite's dev server uses HMR which requires local-only `unsafe-eval` and a WebSocket connection. `frontend/vite.config.ts` configures these **only for development**:

```
script-src 'self' 'unsafe-eval'
connect-src ... ws://localhost:5173
```

`cspNoncePlugin()` is not applied in development mode.

## Verifying

- Run `vite build` and inspect `dist/index.html` — every `<script>` tag should carry a `nonce` attribute.
- Check `<meta name="csp-nonce">` is present in `<head>`.
- Open the app in a browser served with the production CSP header and verify no CSP violations appear in the console.
- Test the Stellar SDK wallet flow to confirm Web Workers load correctly under `worker-src blob:`.
- Use the `Content-Security-Policy-Report-Only` header to collect violations before enforcing.

### Verifying style nonces with report-only mode

1. Serve the production build with the policy under `Content-Security-Policy-Report-Only` (with `style-src 'nonce-{{NONCE}}'` and no `'unsafe-inline'`) and `report-uri /api/csp-report`.
2. Exercise the app so that dynamically injected styles are created (navigate between routes, open modals, trigger lazy-loaded components).
3. Confirm the report endpoint receives **zero** `style-src` violations. Any `style-src` violation indicates a `<style>` tag that bypassed the runtime patch.
4. Once the report-only run is clean, switch to the enforcing `Content-Security-Policy` header.

### Regression test

The `frontend-csp` test suite includes a regression test covering dynamic style injection:

- It builds the app and asserts `style-src` in `PRODUCTION_CSP_TEMPLATE` contains `'nonce-{{NONCE}}'` and does not contain `'unsafe-inline'`.
- It loads `dist/index.html` in a DOM environment, injects a `<style>` element at runtime, and asserts the element carries the same nonce as `<meta name="csp-nonce">`.
- It fails if the runtime patch is removed or if any dynamically created `<style>` tag is left without a nonce.

## Wallet / XSS considerations

- Ensure any dynamic text (proposal titles, descriptions) is escaped before being injected into HTML contexts.
- Prefer rendering as text nodes in React instead of using `dangerouslySetInnerHTML`.
