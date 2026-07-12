import Link from "next/link";
import { APP_NAME, ROUTES } from "@template/shared";
import { BrandMark } from "./BrandMark";

type BrandLockupProps = { href?: string; compact?: boolean; className?: string };

export function BrandLockup({ href = ROUTES.HOME, compact = false, className = "" }: BrandLockupProps): React.ReactElement {
  return (
    <Link href={href} aria-label={`${APP_NAME} home`} className={`group inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={compact ? "md" : "lg"} className="transition-transform group-hover:rotate-6" />
      <span className={`${compact ? "text-base" : "text-xl"} font-extrabold tracking-tight text-ink`}>{APP_NAME}</span>
    </Link>
  );
}
