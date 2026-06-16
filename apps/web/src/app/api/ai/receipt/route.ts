import { parseReceiptImage } from "@template/ai";
import { AI_LIMITS } from "@template/shared/constants";
import { enforceAiRateLimit, jsonResponse, requireBearerUser } from "../_lib";

export const runtime = "nodejs";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export async function POST(request: Request): Promise<Response> {
  const auth = await requireBearerUser(request);
  if (!auth.ok) return auth.response;

  const rate = await enforceAiRateLimit(auth.data.token);
  if (!rate.ok) return rate.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ data: null, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return jsonResponse({ data: null, error: "No file provided" }, { status: 400 });
  }

  if (file.size > AI_LIMITS.MAX_FILE_SIZE_BYTES) {
    return jsonResponse(
      { data: null, error: `File too large. Max ${AI_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` },
      { status: 400 },
    );
  }

  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return jsonResponse({ data: null, error: "Unsupported file type. Use JPEG, PNG, WebP, HEIC, or HEIF." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const strict = new URL(request.url).searchParams.get("strict") === "true";
  const result = await parseReceiptImage(buffer, file.type, { strict });

  return jsonResponse(result);
}
