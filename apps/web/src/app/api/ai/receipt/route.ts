import { type NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@template/supabase";
import { parseReceiptImage } from "@/lib/ai/receipt";
import { AI_LIMITS } from "@template/shared/constants";

export async function POST(request: NextRequest) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ data: null, error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ data: null, error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ data: null, error: "No file provided" }, { status: 400 });
  }

  if (file.size > AI_LIMITS.MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { data: null, error: `File too large. Max ${AI_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.` },
      { status: 400 },
    );
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ data: null, error: "Unsupported file type. Use JPEG, PNG, or WebP." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const result = await parseReceiptImage(buffer, file.type, user.id);
  return NextResponse.json(result);
}
