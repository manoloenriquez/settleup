import { useState, useCallback } from "react";
import * as ImagePicker from "expo-image-picker";
import type { ExpenseExtraction } from "@template/shared/types";
import { structureExpenseFromImage, type ReceiptProvider } from "@/lib/ai/receipt";

export function useReceiptScan() {
  const [receipt, setReceipt] = useState<ExpenseExtraction | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<ReceiptProvider>(null);

  const scanFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is required to scan receipts.");
      return;
    }

    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
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
      mediaTypes: ["images"],
      quality: 0.9,
      allowsEditing: false,
    });

    if (picked.canceled || !picked.assets[0]) return;
    await _processImage(picked.assets[0].uri, picked.assets[0].mimeType ?? "image/jpeg");
  }, []);

  async function _processImage(uri: string, mimeType: string) {
    setIsScanning(true);
    setError(null);
    setReceipt(null);
    setProvider(null);
    setImageUri(uri);

    try {
      const result = await structureExpenseFromImage(uri, mimeType);

      if (result.error) {
        setError(result.error);
      } else {
        setReceipt(result.data);
        setProvider(result.provider);
      }
    } finally {
      setIsScanning(false);
    }
  }

  const clear = useCallback(() => {
    setReceipt(null);
    setImageUri(null);
    setError(null);
    setProvider(null);
  }, []);

  /** Discard the current shot and immediately reopen the camera. */
  const retake = useCallback(async () => {
    clear();
    await scanFromCamera();
  }, [clear, scanFromCamera]);

  return { receipt, imageUri, isScanning, error, provider, scanFromCamera, scanFromGallery, retake, clear };
}
