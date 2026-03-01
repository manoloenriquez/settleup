"use client";

import * as React from "react";
import { useRef, useEffect } from "react";
import { X } from "lucide-react";

type ContentDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function ContentDialog({
  open,
  onClose,
  title,
  children,
  size = "md",
}: ContentDialogProps): React.ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={`backdrop:bg-black/40 rounded-xl border border-slate-200 bg-white p-0 shadow-lg w-full ${sizes[size]} animate-scale-in`}
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <X size={18} />
        </button>
      </div>
      <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
    </dialog>
  );
}
