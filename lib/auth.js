import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { addPasswordAudit, countPasswordAudit, getSetting, setSetting } from "@/lib/store";

const COOKIE_NAME = "hyper_admin";
const PASSWORD_KEY = "admin_password_hash";
const SESSION_AGE = 60 * 60 * 24 * 7;

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "asmaa2026";
}

function getSessionSecret() {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "hyper-asmaa-local-secret";
}

function signSession(expiresAt) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(String(expiresAt))
    .digest("hex");
}

function createSessionValue() {
  const expiresAt = Date.now() + SESSION_AGE * 1000;
  return `${expiresAt}.${signSession(expiresAt)}`;
}

function verifySessionValue(value) {
  const [expiresAt, signature] = String(value || "").split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  const expected = signSession(expiresAt);
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function ensurePasswordHash() {
  const existing = await getSetting(PASSWORD_KEY);
  if (existing?.value) return existing.value;

  const hash = await bcrypt.hash(getAdminPassword(), 10);
  await setSetting(PASSWORD_KEY, hash);
  await addPasswordAudit("تم إنشاء باسورد الإدارة الافتراضي");
  return hash;
}

export async function verifyAdminPassword(password) {
  const hash = await ensurePasswordHash();
  const candidate = String(password || "");
  if (await bcrypt.compare(candidate, hash)) return true;

  // Emergency recovery: if the dashboard hash was created from an old password,
  // allow the current Netlify ADMIN_PASSWORD and refresh the stored hash.
  if (candidate && candidate === getAdminPassword()) {
    await setSetting(PASSWORD_KEY, await bcrypt.hash(candidate, 10));
    await addPasswordAudit("تم تحديث باسورد الإدارة من متغير ADMIN_PASSWORD");
    return true;
  }

  return false;
}

export async function changeAdminPassword(currentPassword, newPassword) {
  if (!(await verifyAdminPassword(currentPassword))) {
    return { ok: false, error: "كلمة المرور الحالية غير صحيحة" };
  }
  if (String(newPassword || "").length < 6) {
    return { ok: false, error: "كلمة المرور الجديدة لازم تكون 6 حروف أو أرقام على الأقل" };
  }

  const hash = await bcrypt.hash(String(newPassword), 10);
  await setSetting(PASSWORD_KEY, hash);
  await addPasswordAudit("تم تغيير باسورد الإدارة من لوحة التحكم");
  return { ok: true };
}

export async function getPasswordAudit() {
  const setting = await getSetting(PASSWORD_KEY);
  return {
    passwordUpdatedAt: setting?.updatedAt || null,
    audit: await countPasswordAudit()
  };
}

export async function isAdmin() {
  const store = await cookies();
  return verifySessionValue(store.get(COOKIE_NAME)?.value);
}

export async function setAdminSession() {
  const store = await cookies();
  store.set(COOKIE_NAME, createSessionValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_AGE,
    path: "/"
  });
}

export async function clearAdminSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export function unauthorized() {
  return Response.json({ error: "غير مصرح" }, { status: 401 });
}
