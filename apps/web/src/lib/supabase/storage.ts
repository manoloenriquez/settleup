import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "payment-qr";

/**
 * Upload a QR image file to the payment-qr storage bucket.
 * Returns the public URL of the uploaded image.
 *
 * @param supabase - An authenticated Supabase client
 * @param groupId  - The group this QR image belongs to
 * @param type     - 'gcash' or 'bank'
 * @param file     - The image File object
 */
export async function uploadQRImage(
  supabase: SupabaseClient,
  groupId: string,
  type: "gcash" | "bank",
  file: File,
): Promise<string> {
  const ext = file.name.split(".").pop() ?? "png";
  const key = `${groupId}/${type}-${randomUUID()}.${ext}`;

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
