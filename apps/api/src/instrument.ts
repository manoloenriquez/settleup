import * as Sentry from "@sentry/node";

// Must be imported before any other module so Sentry can instrument them.
// No DSN means no init and no outbound requests.
const dsn = process.env.SENTRY_DSN;

/**
 * Request bodies on this service carry receipts, expense descriptions,
 * amounts and member names, and the Authorization header carries user JWTs.
 * None of that may leave the process: the request-data integration is limited
 * to method and URL, and `beforeSend` strips anything that still slips in.
 */
function scrubRequest(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    event.request = { method: event.request.method, url: event.request.url };
  }
  delete event.user;
  return event;
}

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? "development",
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    integrations: [
      Sentry.requestDataIntegration({
        include: {
          data: false,
          cookies: false,
          headers: false,
          ip: false,
          query_string: false,
          url: true,
        },
      }),
    ],
    beforeSend: scrubRequest,
  });
}

export const sentryEnabled = Boolean(dsn);
