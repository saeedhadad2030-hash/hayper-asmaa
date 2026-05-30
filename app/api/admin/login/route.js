import { setAdminSession, verifyAdminPassword } from "@/lib/auth";

export const runtime = "nodejs";

const attempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function getClientKey(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request) {
  const key = getClientKey(request);
  const now = Date.now();
  const record = attempts.get(key) || { count: 0, resetAt: now + WINDOW_MS };
  if (record.resetAt < now) {
    record.count = 0;
    record.resetAt = now + WINDOW_MS;
  }
  if (record.count >= MAX_ATTEMPTS) {
    return Response.json({ error: "محاولات كتير. جرب تاني بعد شوية" }, { status: 429 });
  }

  const { password } = await request.json();
  if (!(await verifyAdminPassword(password))) {
    attempts.set(key, { count: record.count + 1, resetAt: record.resetAt });
    return Response.json({ error: "كلمة المرور غير صحيحة" }, { status: 401 });
  }
  attempts.delete(key);
  await setAdminSession();
  return Response.json({ ok: true });
}
