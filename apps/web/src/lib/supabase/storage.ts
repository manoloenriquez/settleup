import { randomUUID } from "crypto";
import type { SupabaseClient } from "@template/supabase";

const BUCKET = "payment-qr";

/**
 * Upload a QR image file to the payment-qr storage bucket.
 * Returns the public URL of the uploaded image.
 *
 * @param supabase - An authenticated Supabase client
 * @param userId   - The user who owns this QR image (used as folder prefix)
 * @param type     - 'gcash' or 'bank'
 * @param file     - The image File object
 */
export async function uploadQRImage(
  supabase: SupabaseClient,
  userId: string,
  type: "gcash" | "bank",
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const key = `${userId}/${type}-${randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(key, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) throw new Error(error.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(key);

  return publicUrl;
}
