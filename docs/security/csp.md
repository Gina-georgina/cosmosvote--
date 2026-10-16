# Content Security Policy (CSP)

CosmosVote implements a strict Content Security Policy to protect users from Cross-Site Scripting (XSS) and other injection attacks. This is especially critical as the application interacts with blockchain wallets and handles sensitive transaction data.

## Policy Overview

The enforced production policy is attached to the CloudFront distribution by Terraform. It is sent as an HTTP response header so directives such as `frame-ancestors` are enforced. Terraform also provisions an API Gateway endpoint and Lambda collector; sanitized violation fields are retained in its CloudWatch log group for 14 days.

The policy is:

```
default-src 'self';
base-uri 'self';
form-action 'self';
object-src 'none';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self' https://soroban-testnet.stellar.org https://soroban-mainnet.stellar.org <configured-faucet-api-origin>;
frame-ancestors 'none';
upgrade-insecure-requests;
report-uri https://<environment-specific-api-gateway>/report;
```

### Directive Breakdown

- **`default-src 'self'`**: Only allow resources from the same origin by default.
- **`script-src 'self'`**: Disallow all inline scripts and external scripts not from the same origin.
- **`style-src 'self' 'unsafe-inline'`**: Allow styles from the same origin and inline styles (required for some React components and Vite's development HMR).
- **`img-src 'self' data:`**: Allow images from the same origin and data URIs.
- **`connect-src 'self' ...`**: Limit network requests (XHR/Fetch/WebSockets) to the same origin and whitelisted Stellar RPC nodes:
    - `https://soroban-testnet.stellar.org`
    - `https://soroban-mainnet.stellar.org`
- **`frame-ancestors 'none'`**: Prevent the application from being embedded in iframes (Clickjacking protection).
- **`upgrade-insecure-requests`**: Instructs browsers to treat all of the site's insecure URLs (those over HTTP) as though they have been replaced with secure URLs (those over HTTPS).

## Implementation

### Development

In development, the policy is enforced by the Vite dev server via headers in `frontend/vite.config.ts`.

### Production

In production, CloudFront sends the policy using `aws_cloudfront_response_headers_policy.frontend_security`. The API Gateway reporter accepts POSTs at `/report`, applies request throttling, and logs sanitized CSP fields to `/aws/lambda/cosmosvote-csp-reporter-<environment>`.

The policy is also sent by Vite's dev server with local-only HMR allowances. No `unsafe-inline` script permission is used in either policy.
