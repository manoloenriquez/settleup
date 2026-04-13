import { Hono } from "hono";
import { parseReceiptImage } from "@template/ai";
import { AI_LIMITS } from "@template/shared/constants";
import { authMiddleware, type AuthEnv } from "../middleware/auth";
import { rateLimitMiddleware } from "../middleware/rate-limit";

const receipt = new Hono<AuthEnv>();

receipt.post("/", authMiddleware, rateLimitMiddleware, async (c) => {
  let formData: FormData;
  try {
    formData = await c.req.formData();
  } catch {
    return c.json({ data: null, error: "Invalid form data" }, 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return c.json({ data: null, error: "No file provided" }, 400);
  }

  if (file.size > AI_LIMITS.MAX_FILE_SIZE_BYTES) {
    return c.json(
      { data: null, error: `File too large. Max ${AI_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` },
      400,
    );
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ data: null, error: "Unsupported file type. Use JPEG, PNG, or WebP." }, 400);
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const strict = c.req.query("strict") === "true";
  const result = await parseReceiptImage(buffer, file.type, { strict });
  return c.json(result);
});

export default receipt;
