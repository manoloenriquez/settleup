"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";

type MenuItem = {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  icon?: React.ReactNode;
};

type DropdownMenuProps = {
  items: MenuItem[];
};

export function DropdownMenu({ items }: DropdownMenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
        aria-label="More actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg animate-scale-in">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onClick();
                setOpen(false);
              }}
              className={[
                "flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors",
                item.variant === "danger"
                  ? "text-red-600 hover:bg-red-50"
                  : "text-slate-700 hover:bg-slate-50",
              ].join(" ")}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
