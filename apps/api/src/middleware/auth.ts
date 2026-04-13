import { createMiddleware } from "hono/factory";
import { createAnonClient } from "../lib/supabase";

export type AuthEnv = {
  Variables: {
    user: { id: string };
    token: string;
  };
};

export const authMiddleware = createMiddleware<AuthEnv>(async (c, next) => {
  const token = c.req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return c.json({ data: null, error: "Unauthorized" }, 401);
  }

  const supabase = createAnonClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return c.json({ data: null, error: "Unauthorized" }, 401);
  }

  c.set("user", { id: user.id });
  c.set("token", token);
  await next();
  return;
});
