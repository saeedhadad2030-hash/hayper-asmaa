import { isAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ authenticated: await isAdmin() });
}
