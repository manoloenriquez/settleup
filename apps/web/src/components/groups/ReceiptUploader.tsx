"use client";

import { useState, useTransition, useRef } from "react";
import { parseReceipt } from "@/app/actions/ai";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Upload, Camera, X } from "lucide-react";
import type { ParsedReceipt } from "@template/shared/types";
import { AI_LIMITS } from "@template/shared/constants";

type Props = {
  onParsed: (receipt: ParsedReceipt) => void;
};

export function ReceiptUploader({ onParsed }: Props): React.ReactElement {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File): void {
    setError(null);
    if (f.size > AI_LIMITS.MAX_FILE_SIZE_BYTES) {
      setError(`File too large. Max ${AI_LIMITS.MAX_FILE_SIZE_BYTES / 1024 / 1024}MB.`);
      return;
    }
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const f = e.target.files?.[0];
    if (f) handleFile(f);
  }

  function clearFile(): void {
    setFile(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleUpload(): void {
    if (!file) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const result = await parseReceipt(formData);
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        onParsed(result.data);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!file ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center hover:border-indigo-400 hover:bg-indigo-50/50 transition-colors cursor-pointer"
          onClick={() => inputRef.current?.click()}
        >
          <div className="rounded-full bg-indigo-100 p-3 mb-3">
            <Camera size={24} className="text-indigo-600" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            Drop a receipt image or tap to upload
          </p>
          <p className="text-xs text-slate-500 mt-1">JPEG, PNG, or WebP up to 5MB</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            onChange={handleChange}
            className="hidden"
          />
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3 min-w-0">
                {preview && (
                  <img
                    src={preview}
                    alt="Receipt preview"
                    className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{file.name}</p>
                  <p className="text-xs text-slate-500">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearFile}
                className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X size={16} />
              </button>
            </div>
            <Button
              onClick={handleUpload}
              isLoading={isPending}
              leftIcon={Upload}
              size="sm"
            >
              {isPending ? "Scanning receipt..." : "Scan Receipt"}
            </Button>
          </CardContent>
        </Card>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
