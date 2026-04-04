import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import type { ParsedReceipt } from "@template/shared/types";
import { parseReceiptMobile } from "@/lib/ai/receipt";

export function useReceiptScan() {
  const [receipt, setReceipt] = useState<ParsedReceipt | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scanFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to scan receipts.");
      return;
    }

    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.9,
      allowsEditing: false,
    });

    if (picked.canceled || !picked.assets[0]) return;
    await _processImage(picked.assets[0].uri, picked.assets[0].mimeType ?? "image/jpeg");
  }, []);

  const scanFromGallery = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required to scan receipts.");
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.9,
      allowsEditing: false,
    });

    if (picked.canceled || !picked.assets[0]) return;
    await _processImage(picked.assets[0].uri, picked.assets[0].mimeType ?? "image/jpeg");
  }, []);

  async function _processImage(uri: string, mimeType: string) {
    setIsScanning(true);
    setError(null);
    setImageUri(uri);

    try {
      let ocrText = "";

      // Try ML Kit OCR (react-native-mlkit-ocr)
      try {
        const MlkitOcr = (await import("react-native-mlkit-ocr")).default;
        const result = await MlkitOcr.detectFromUri(uri);
        ocrText = result.map((b) => b.text).join("\n");
      } catch {
        // ML Kit not installed — ocrText stays empty, regex fallback will apply
      }

      const result = await parseReceiptMobile({ ocrText, imageUri: uri, imageMimeType: mimeType });

      if (result.error) {
        setError(result.error);
      } else {
        setReceipt(result.data);
      }
    } finally {
      setIsScanning(false);
    }
  }

  const clear = useCallback(() => {
    setReceipt(null);
    setImageUri(null);
    setError(null);
  }, []);

  return { receipt, imageUri, isScanning, error, scanFromCamera, scanFromGallery, clear };
}
