import { supabase } from "@/lib/supabase";
import { upsertPaymentProfileSchema } from "@template/shared";
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
  const ext = asset.uri.split(".").pop() ?? "jpg";
  const path = `${userId}/${type}-qr-${Date.now()}.${ext}`;

  const response = await fetch(asset.uri);
  const blob = await response.blob();

  const { error: uploadError } = await supabase.storage
    .from("payment-qr")
    .upload(path, blob, { contentType: `image/${ext}`, upsert: true });

  if (uploadError) return { data: null, error: uploadError.message };

  const { data: urlData } = supabase.storage.from("payment-qr").getPublicUrl(path);
  return { data: urlData.publicUrl, error: null };
}
