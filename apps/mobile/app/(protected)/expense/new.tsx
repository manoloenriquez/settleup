import { useLocalSearchParams } from "expo-router";
import { PersonalExpenseForm } from "@/components/personal/PersonalExpenseForm";

export default function NewPersonalExpenseScreen() {
  const { assist } = useLocalSearchParams<{ assist?: string }>();
  return (
    <PersonalExpenseForm
      initialAssist={assist === "scan" || assist === "describe" ? assist : "none"}
    />
  );
}
