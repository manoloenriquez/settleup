import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import health from "./routes/health";
import receipt from "./routes/receipt";
import conversation from "./routes/conversation";
import smartSplit from "./routes/smart-split";
import insightsSummary from "./routes/insights-summary";
import account from "./routes/account";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const app = new Hono();

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return null;
      // Allow exact matches + any Expo Go dev URLs (exp://…)
      if (allowedOrigins.includes(origin)) return origin;
      if (origin.startsWith("exp://") || origin.startsWith("exps://")) return origin;
      return null;
    },
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    maxAge: 86400,
  }),
);

app.route("/health", health);
app.route("/ai/receipt", receipt);
app.route("/ai/conversation", conversation);
app.route("/ai/smart-split", smartSplit);
app.route("/ai/insights-summary", insightsSummary);
app.route("/account", account);

app.notFound((c) => c.json({ data: null, error: "Not found" }, 404));

app.onError((err, c) => {
  console.error("[api] unhandled error:", err);
  return c.json({ data: null, error: "Something went wrong." }, 500);
});

const port = Number(process.env.PORT ?? 4000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
