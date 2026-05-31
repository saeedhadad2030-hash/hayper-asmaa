import crypto from "node:crypto";
import { getSupabaseBaseUrl } from "@/lib/store";

const BUCKET = "product-images";

function storageHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

export function parseImageDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (!match) return null;
  const mime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const ext = mime.split("/")[1].replace("jpeg", "jpg");
  return {
    buffer: Buffer.from(match[2], "base64"),
    ext,
    mime
  };
}

async function ensureBucket() {
  const baseUrl = getSupabaseBaseUrl();
  const check = await fetch(`${baseUrl}/storage/v1/bucket/${BUCKET}`, {
    headers: storageHeaders()
  });
  if (check.ok) {
    await fetch(`${baseUrl}/storage/v1/bucket/${BUCKET}`, {
      method: "PUT",
      headers: storageHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        public: true,
        file_size_limit: 5242880,
        allowed_mime_types: ["image/jpeg", "image/png", "image/webp"]
      })
    }).catch(() => {});
    return;
  }

  const create = await fetch(`${baseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: storageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      file_size_limit: 5242880,
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"]
    })
  });

  if (!create.ok && create.status !== 409) {
    const text = await create.text();
    throw new Error(`تعذر إنشاء مساحة الصور: ${text.slice(0, 180)}`);
  }
}

async function uploadObject(path, file) {
  const baseUrl = getSupabaseBaseUrl();
  const url = `${baseUrl}/storage/v1/object/${BUCKET}/${path}`;
  const headers = storageHeaders({
    "Content-Type": file.mime,
    "x-upsert": "true"
  });

  let response = await fetch(url, {
    method: "POST",
    headers,
    body: file.buffer
  });

  if (!response.ok && [400, 405].includes(response.status)) {
    response = await fetch(url, {
      method: "PUT",
      headers,
      body: file.buffer
    });
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`تعذر رفع الصورة: ${text.slice(0, 180)}`);
  }
}

export async function uploadProductImageDataUrl(image) {
  const file = parseImageDataUrl(image);
  if (!file) throw new Error("صيغة الصورة غير صحيحة");
  await ensureBucket();
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${file.ext}`;
  await uploadObject(path, file);
  return `${getSupabaseBaseUrl()}/storage/v1/object/public/${BUCKET}/${path}`;
}
