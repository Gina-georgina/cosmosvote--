/**
 * vite-plugin-csp-nonce – Issue #31
 *
 * A Vite HTML transform plugin that injects a per-build nonce into every
 * inline <script> and <style> tag in the production HTML output, and
 * adds a <meta name="csp-nonce"> tag so the running app can read it.
 *
 * This replaces 'unsafe-inline' in script-src with 'nonce-<value>' in production.
 *
 * Usage in vite.config.ts:
 *   import { cspNoncePlugin } from './vite-plugin-csp-nonce';
 *   plugins: [react(), cspNoncePlugin()],
 *
 * In production the nonce value is embedded in the HTML at build time.
 * The server (CloudFront / Lambda@Edge) must read the nonce from the
 * <meta name="csp-nonce"> tag and echo it back in the Content-Security-Policy
 * response header. See docs/frontend-csp.md for the full deployment guide.
 *
 * NOTE: A static-file host (S3 + CloudFront without Lambda@Edge) cannot
 * rotate nonces per-request, so the nonce is per-build rather than
 * per-request. This still removes 'unsafe-inline' from script-src and
 * provides meaningful protection when combined with strict frame-ancestors
 * and object-src directives.
 *
 * Issue #392: dynamically injected <style> tags (CSS-in-JS, Vite HMR,
 * third-party libs) bypass the style-src directive unless they also carry
 * the nonce. A small runtime snippet is injected into the HTML that patches
 * document.createElement / Element.prototype.appendChild / insertBefore so
 * any <style> element created at runtime receives the nonce read from
 * <meta name="csp-nonce">.
 */

import crypto from 'crypto';
import type { Plugin } from 'vite';

/**
 * Runtime snippet (as a string) that patches DOM APIs so any dynamically
 * created <style> element receives the CSP nonce. It is injected as an
 * inline <script> in the HTML head (which itself gets the nonce applied by
 * the build-time transform).
 *
 * The snippet is idempotent and safe to run in non-browser environments.
 */
export const CSP_STYLE_NONCE_RUNTIME = `(function () {
  if (typeof document === 'undefined') return;
  if (window.__cspStyleNonceInstalled) return;
  window.__cspStyleNonceInstalled = true;

  function getNonce() {
    var meta = document.querySelector('meta[name="csp-nonce"]');
    return meta && meta.content ? meta.content : null;
  }

  function applyNonce(el) {
    if (!el || el.tagName !== 'STYLE') return el;
    if (el.getAttribute('nonce')) return el;
    var nonce = getNonce();
    if (nonce) {
      el.setAttribute('nonce', nonce);
      // Some browsers only honour the IDL property for CSP checks.
      try { el.nonce = nonce; } catch (e) {}
    }
    return el;
  }

  // Expose helper for tests / app code.
  window.__applyCspStyleNonce = applyNonce;

  var origCreateElement = document.createElement.bind(document);
  document.createElement = function (tagName) {
    var el = origCreateElement.apply(document, arguments);
    if (typeof tagName === 'string' && tagName.toLowerCase() === 'style') {
      applyNonce(el);
    }
    return el;
  };

  var origAppendChild = Element.prototype.appendChild;
  Element.prototype.appendChild = function (child) {
    applyNonce(child);
    return origAppendChild.call(this, child);
  };

  var origInsertBefore = Element.prototype.insertBefore;
  Element.prototype.insertBefore = function (newNode, referenceNode) {
    applyNonce(newNode);
    return origInsertBefore.call(this, newNode, referenceNode);
  };

  // Catch styles inserted via innerHTML / insertAdjacentHTML.
  if (typeof MutationObserver !== 'undefined') {
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node && node.tagName === 'STYLE') applyNonce(node);
        }
      }
    });
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
    });
  }
})();`;

export function cspNoncePlugin(): Plugin {
  // Generate a fresh nonce for every build
  const nonce = crypto.randomBytes(16).toString('base64');

  return {
    name: 'vite-plugin-csp-nonce',
    // Only run during the production build, not the dev server
    apply: 'build',

    transformIndexHtml(html: string): string {
      let result = html;

      // 1. Inject nonce attribute onto every inline <script …> tag
      result = result.replace(
        /<script(\b[^>]*)>/g,
        (_match: string, attrs: string) => {
          // Skip external scripts that already carry a src attribute — they
          // don't need a nonce because they're not inline.
          if (/\bsrc\s*=/.test(attrs)) {
            return `<script${attrs} nonce="${nonce}">`;
          }
          return `<script${attrs} nonce="${nonce}">`;
        },
      );

      // 2. Inject nonce onto every inline <style> tag
      result = result.replace(
        /<style(\b[^>]*)>/g,
        (_match: string, attrs: string) => `<style${attrs} nonce="${nonce}">`,
      );

      // 3. Add <meta name="csp-nonce" content="<nonce>"> into <head>
      //    The server-side edge function reads this tag to build the
      //    Content-Security-Policy response header.
      result = result.replace(
        '</head>',
        `  <meta name="csp-nonce" content="${nonce}">\n  </head>`,
      );

      // 4. Inject the runtime snippet that applies the nonce to dynamically
      //    created <style> tags. It must run before any app code, so place
      //    it right after the meta tag (still inside <head>).
      result = result.replace(
        `  <meta name="csp-nonce" content="${nonce}">\n  </head>`,
        `  <meta name="csp-nonce" content="${nonce}">\n` +
          `  <script nonce="${nonce}">${CSP_STYLE_NONCE_RUNTIME}</script>\n  </head>`,
      );

      return result;
    },
  };
}

/** Read the nonce that was embedded at build time from the DOM. */
export function readCspNonce(): string | null {
  if (typeof document === 'undefined') return null;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]');
  return meta?.content ?? null;
}

/**
 * Apply the build-time CSP nonce to a <style> element. Exported so tests
 * (and app code) can assert that dynamically injected styles receive the
 * nonce. Returns the element for chaining.
 */
export function applyCspStyleNonce<T extends HTMLElement>(el: T): T {
  if (typeof document === 'undefined') return el;
  if (!el || el.tagName !== 'STYLE') return el;
  if (el.getAttribute('nonce')) return el;
  const nonce = readCspNonce();
  if (nonce) {
    el.setAttribute('nonce', nonce);
    try {
      (el as unknown as { nonce: string }).nonce = nonce;
    } catch {
      /* ignore */
    }
  }
  return el;
}
