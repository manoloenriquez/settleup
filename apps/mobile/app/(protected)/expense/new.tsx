import { useLocalSearchParams } from "expo-router";
import { PersonalExpenseForm } from "@/components/personal/PersonalExpenseForm";
import { parsePersonalPrefill } from "@/lib/assistant/prefill";

export default function NewPersonalExpenseScreen() {
  const { assist, prefill } = useLocalSearchParams<{ assist?: string; prefill?: string }>();
  return (
    <PersonalExpenseForm
      initialAssist={assist === "scan" || assist === "describe" ? assist : "none"}
      prefill={parsePersonalPrefill(prefill) ?? undefined}
    />
  );
}
