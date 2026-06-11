"use client";

import * as React from "react";

type Tab = {
  id: string;
  label: string;
  icon?: React.ReactNode;
};

type TabsProps = {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  children: React.ReactNode;
};

export function Tabs({ tabs, activeTab, onChange, children }: TabsProps): React.ReactElement {
  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (next) {
      onChange(next.id);
      const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='tab']");
      buttons?.[(index + delta + tabs.length) % tabs.length]?.focus();
    }
  }

  return (
    <div>
      <div className="border-b border-slate-200">
        <div className="-mb-px flex gap-1" role="tablist" aria-label="Tabs">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => onChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={[
                "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
              ].join(" ")}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pt-4" role="tabpanel" id={`tabpanel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {children}
      </div>
    </div>
  );
}
