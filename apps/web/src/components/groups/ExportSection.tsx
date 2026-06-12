"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { getGroupLedger } from "@/app/actions/export";
import { buildGroupLedgerCsv } from "@template/shared";
import { Button } from "@/components/ui/Button";
import { Download, Printer } from "lucide-react";

type Props = {
  groupId: string;
  groupName: string;
  shareToken: string;
};

export function ExportSection({ groupId, groupName, shareToken }: Props): React.ReactElement {
  const [isPending, startTransition] = useTransition();

  function handleDownload(): void {
    startTransition(async () => {
      const result = await getGroupLedger(groupId);
      if (result.error || !result.data) {
        toast.error(result.error ?? "Export failed.");
        return;
      }
      const csv = buildGroupLedgerCsv(result.data.expenses, result.data.payments);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${groupName.replace(/[^\w\d-]+/g, "-").toLowerCase()}-ledger.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Ledger downloaded");
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900 mb-1 flex items-center gap-2">
        <Download size={16} className="text-brand-500" />
        Export
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        Download the full expense and payment history, or print the group summary.
      </p>
      <div className="flex gap-2">
        <Button onClick={handleDownload} isLoading={isPending} leftIcon={Download}>
          Download CSV
        </Button>
        <a href={`/g/${shareToken}`} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" leftIcon={Printer}>
            Print summary
          </Button>
        </a>
      </div>
    </section>
  );
}
