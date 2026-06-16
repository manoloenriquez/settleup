/// <reference lib="webworker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, CacheableResponsePlugin, ExpirationPlugin, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected at build time by @serwist/next — the precache manifest
    // (Next.js build assets + the precached /~offline page).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Custom runtime caching, evaluated before Serwist's Next.js defaults.
 *
 * The app is auth-gated and server-rendered, so we are deliberately conservative:
 * we never cache Supabase API/auth/realtime responses or Server Action POSTs.
 * Previously-visited pages and static assets are cached so the installed app
 * opens instantly and works read-only offline.
 */
const runtimeCaching: RuntimeCaching[] = [
  // Never cache Supabase data/auth/realtime — always hit the network.
  {
    matcher: ({ url }) =>
      url.hostname.endsWith(".supabase.co") && !url.pathname.startsWith("/storage/"),
    handler: new NetworkOnly(),
  },
  // Cache public Supabase Storage images (avatars, receipts) aggressively.
  {
    matcher: ({ url }) =>
      url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/"),
    handler: new CacheFirst({
      cacheName: "supabase-storage-images",
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },
  // Never cache the Sentry monitoring tunnel.
  {
    matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/monitoring"),
    handler: new NetworkOnly(),
  },
  // Never cache mutations (Server Actions / form POSTs).
  {
    matcher: ({ request }) => request.method !== "GET",
    handler: new NetworkOnly(),
  },
  // Serwist's recommended Next.js defaults: NetworkFirst for pages/RSC,
  // StaleWhileRevalidate for static JS/CSS, CacheFirst for fonts/images, etc.
  ...defaultCache,
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        // Branded offline screen shown when a navigation can't be served
        // from the network or the runtime cache.
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
