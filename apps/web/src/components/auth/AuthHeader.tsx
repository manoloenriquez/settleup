import { BrandLockup } from "@/components/brand/BrandLockup";

type AuthHeaderProps = { title: string; description: string };

export function AuthHeader({ title, description }: AuthHeaderProps): React.ReactElement {
  return (
    <div className="mb-8 flex flex-col items-center gap-4">
      <BrandLockup />
      <div className="text-center">
        <h1 className="text-xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
