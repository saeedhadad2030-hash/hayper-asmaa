import { changeAdminPassword, getPasswordAudit, isAdmin, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json(await getPasswordAudit());
}

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const result = await changeAdminPassword(body.currentPassword, body.newPassword);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json({ ok: true });
}
