import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { CreateGroupForm } from "@/components/groups/CreateGroupForm";

export default function NewGroupPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6 animate-fade-in max-w-lg mx-auto w-full">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Users size={20} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Create New Group</h1>
          <p className="text-sm text-slate-500 mt-0.5">Start tracking shared expenses with your group.</p>
        </div>
      </div>
      <Card>
        <CardContent>
          <CreateGroupForm />
        </CardContent>
      </Card>
    </div>
  );
}
