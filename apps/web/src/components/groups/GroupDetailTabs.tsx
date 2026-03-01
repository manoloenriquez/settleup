"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Scale, Receipt, Plus } from "lucide-react";

type Props = {
  balancesContent: React.ReactNode;
  expensesContent: React.ReactNode;
  addExpenseContent: React.ReactNode;
};

const tabs = [
  { id: "balances", label: "Balances", icon: <Scale size={16} /> },
  { id: "expenses", label: "Expenses", icon: <Receipt size={16} /> },
  { id: "add", label: "Add Expense", icon: <Plus size={16} /> },
] as const;

export function GroupDetailTabs({
  balancesContent,
  expensesContent,
  addExpenseContent,
}: Props): React.ReactElement {
  const [activeTab, setActiveTab] = useState("balances");

  return (
    <Tabs tabs={[...tabs]} activeTab={activeTab} onChange={setActiveTab}>
      <div className={activeTab !== "balances" ? "hidden" : undefined}>
        {balancesContent}
      </div>
      <div className={activeTab !== "expenses" ? "hidden" : undefined}>
        {expensesContent}
      </div>
      <div className={activeTab !== "add" ? "hidden" : undefined}>
        {addExpenseContent}
      </div>
    </Tabs>
  );
}
