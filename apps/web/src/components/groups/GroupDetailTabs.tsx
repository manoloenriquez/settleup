"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Scale, Receipt, BarChart3 } from "lucide-react";

type Props = {
  expensesContent: React.ReactNode;
  balancesContent: React.ReactNode;
  chartsContent: React.ReactNode;
};

const tabs = [
  { id: "expenses", label: "Expenses", icon: <Receipt size={16} /> },
  { id: "balances", label: "Balances", icon: <Scale size={16} /> },
  { id: "charts", label: "Charts", icon: <BarChart3 size={16} /> },
] as const;

export function GroupDetailTabs({
  expensesContent,
  balancesContent,
  chartsContent,
}: Props): React.ReactElement {
  const [activeTab, setActiveTab] = useState("expenses");

  return (
    <Tabs tabs={[...tabs]} activeTab={activeTab} onChange={setActiveTab}>
      <div className={activeTab !== "expenses" ? "hidden" : undefined}>
        {expensesContent}
      </div>
      <div className={activeTab !== "balances" ? "hidden" : undefined}>
        {balancesContent}
      </div>
      <div className={activeTab !== "charts" ? "hidden" : undefined}>
        {chartsContent}
      </div>
    </Tabs>
  );
}
