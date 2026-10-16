# Frontend Content Security Policy (CSP)

This document describes recommended CSP directives and how to apply them for development and production.

## Production

Production CloudFront responses receive the CSP from Terraform's response headers policy. Terraform provisions a rate-limited API Gateway/Lambda endpoint for CSP reports and retains sanitized report fields in CloudWatch for 14 days. Do not use a CSP meta tag: it cannot enforce `frame-ancestors` and is no longer present in `frontend/index.html`.

The policy limits scripts to same-origin files, and limits connections to the app, the supported Stellar testnet/mainnet RPC endpoints, and the configured faucet API origin. Inline styles remain enabled because the existing React UI uses style attributes; inline scripts are disallowed.

Notes:
- Use server headers where possible; they cannot be overridden by an attacker.
- Avoid `'unsafe-inline'` and `'unsafe-eval'` in production. They are not enabled for scripts.

## Development (Vite)

Vite's dev server uses HMR which requires local-only `unsafe-eval` and a WebSocket connection. `frontend/vite.config.ts` configures these only for development:

`script-src 'self' 'unsafe-eval'` and `connect-src ... ws://localhost:5173`.

## Verifying

- Open the app in the browser and check the developer console for CSP violations.
- Test common flows: loading app, fetching proposals, connecting wallet.

## Wallet / XSS considerations

- Ensure any dynamic text (proposal titles, descriptions) is escaped before being injected into HTML contexts.
- Prefer rendering as text nodes in React instead of using `dangerouslySetInnerHTML`.
