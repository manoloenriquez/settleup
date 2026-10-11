import { supabase } from "@/lib/supabase";
import { MAX_QR_FILE_SIZE_BYTES, QR_ALLOWED_MIME_TYPES, QR_BUCKET, upsertPaymentProfileSchema } from "@template/shared";
import type { ApiResponse } from "@template/shared";
import * as ImagePicker from "expo-image-picker";

type PaymentProfile = {
  user_id: string;
  gcash_name: string | null;
  gcash_number: string | null;
  gcash_qr_url: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  bank_account_name: string | null;
  bank_qr_url: string | null;
  notes: string | null;
  show_on_shared_links: boolean;
  share_full_numbers: boolean;
};

export async function getPaymentProfile(userId: string): Promise<ApiResponse<PaymentProfile | null>> {
  const { data, error } = await supabase
    .schema("settleup")
    .from("user_payment_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: data as PaymentProfile | null, error: null };
}

export async function upsertPaymentProfile(
  userId: string,
  profile: Omit<PaymentProfile, "user_id">
): Promise<ApiResponse<PaymentProfile>> {
  const parsed = upsertPaymentProfileSchema.safeParse(profile);
  if (!parsed.success) return { data: null, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { data, error } = await supabase
    .schema("settleup")
    .from("user_payment_profiles")
    .upsert({ ...parsed.data, user_id: userId }, { onConflict: "user_id" })
    .select()
    .single();

  if (error || !data) return { data: null, error: error?.message ?? "Failed to save profile" };
  return { data: data as PaymentProfile, error: null };
}

export async function uploadQRImage(userId: string, type: "gcash" | "bank"): Promise<ApiResponse<string>> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });

  if (result.canceled || !result.assets[0]) return { data: null, error: "Cancelled" };

  const asset = result.assets[0];
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  // Check the actual image before it leaves the phone.
  const mimeType = asset.mimeType ?? blob.type;
  if (!QR_ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { data: null, error: "Choose a JPEG, PNG or WebP image." };
  }
  const size = asset.fileSize ?? blob.size;
  if (size > MAX_QR_FILE_SIZE_BYTES) {
    return { data: null, error: `Choose an image under ${MAX_QR_FILE_SIZE_BYTES / 1024 / 1024} MB.` };
  }

  const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${type}-qr-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from(QR_BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: false });

  if (uploadError) return { data: null, error: uploadError.message };

  const { data: urlData } = supabase.storage.from(QR_BUCKET).getPublicUrl(path);
  return { data: urlData.publicUrl, error: null };
}

/**
 * Best-effort removal of QR images the saved profile no longer uses (replaced
 * or never saved). Only paths in this user's folder are ever passed.
 */
export async function removeQRImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  await supabase.storage
    .from(QR_BUCKET)
    .remove(paths)
    .catch(() => undefined);
}

/**
 * Delete every QR image in this user's folder. Called before closing the
 * account, which removes the profile row directly, so nothing else would ever
 * clean these public files up. Best effort: closing still goes ahead.
 */
export async function removeAllMyQRImages(userId: string): Promise<void> {
  if (!userId) return;
  const { data } = await supabase.storage.from(QR_BUCKET).list(userId, { limit: 1000 });
  const paths = (data ?? []).map((file) => `${userId}/${file.name}`);
  await removeQRImages(paths);
}
