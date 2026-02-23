import { CreateGroupForm } from "@/components/groups/CreateGroupForm";

export default function NewGroupPage(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">Create New Group</h1>
      <CreateGroupForm />
    </div>
  );
}
