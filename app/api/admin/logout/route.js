import { clearAdminSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  await clearAdminSession();
  return Response.json({ ok: true });
}
