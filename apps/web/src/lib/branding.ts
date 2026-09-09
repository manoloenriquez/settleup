import { emailSchema } from "@template/shared";
const support = emailSchema.safeParse(process.env.NEXT_PUBLIC_SUPPORT_EMAIL);
export const SUPPORT_EMAIL = support.success ? support.data : null;
export const SUPPORT_HREF = SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}` : "/support";
