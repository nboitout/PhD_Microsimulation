// Vercel project configuration.
//
// The site is static: `npm run build` runs the model, writes data/*.json and
// site/data/*.js, renders the mathematics with KaTeX and assembles
// site/index.html. Vercel then serves site/ as files. There is no server, no
// framework, and no function — the build is the whole of it.

import { routes, type VercelConfig } from '@vercel/config/v1';

export const config: VercelConfig = {
  // No framework preset: this is hand-written HTML, CSS and JavaScript.
  framework: null,
  buildCommand: 'npm run build',
  outputDirectory: 'site',

  headers: [
    // The KaTeX faces are the only large assets, and they are stable for the
    // life of a KaTeX release, so they are worth caching hard.
    routes.cacheControl('/vendor/katex/fonts/(.*)', {
      public: true,
      maxAge: '1 year',
      immutable: true,
    }),

    // Everything else is small and changes whenever the model or the page
    // does, so it is revalidated rather than pinned. The generated data is
    // rewritten by every build and must not be served stale beside a page
    // that expects new fields.
    routes.cacheControl('/data/(.*)', { public: true, maxAge: '5 minutes' }),

    {
      source: '/(.*)',
      headers: [
        // The page loads nothing from anywhere else — no CDN, no analytics,
        // no third-party anything — so the policy can say exactly that and be
        // enforced rather than merely intended.
        {
          key: 'Content-Security-Policy',
          value: [
            "default-src 'self'",
            // The theme is applied before first paint by a small inline
            // script, to stop the page flashing the wrong one.
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "worker-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'none'",
            "form-action 'none'",
          ].join('; '),
        },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};
