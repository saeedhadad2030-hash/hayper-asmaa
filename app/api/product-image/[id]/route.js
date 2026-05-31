import { parseImageDataUrl } from "@/lib/product-images";
import { getProduct, getSupabaseBaseUrl, hasSupabase } from "@/lib/store";

export const runtime = "nodejs";

function storageHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

function imageResponse(body, contentType) {
  return new Response(body, {
    headers: {
      "Content-Type": contentType || "image/jpeg",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800"
    }
  });
}

function storageObjectPath(image) {
  try {
    const url = new URL(image);
    const prefix = "/storage/v1/object/public/product-images/";
    if (url.pathname.startsWith(prefix)) return url.pathname.slice(prefix.length);
  } catch {}
  return "";
}

async function fetchImageUrl(image) {
  const publicResponse = await fetch(image, {
    headers: { Accept: "image/*" }
  }).catch(() => null);

  if (publicResponse?.ok) return publicResponse;

  const path = storageObjectPath(image);
  if (!path || !hasSupabase()) return publicResponse;

  return fetch(`${getSupabaseBaseUrl()}/storage/v1/object/product-images/${path}`, {
    headers: storageHeaders({ Accept: "image/*" })
  }).catch(() => null);
}

export async function GET(_request, { params }) {
  const { id } = await params;
  const product = await getProduct(Number(id), { withImage: true });
  const image = String(product?.image || "").trim();
  if (!image) return new Response("Image not found", { status: 404 });

  const dataUrl = parseImageDataUrl(image);
  if (dataUrl) return imageResponse(dataUrl.buffer, dataUrl.mime);

  if (!image.startsWith("http://") && !image.startsWith("https://")) {
    return new Response("Unsupported image", { status: 400 });
  }

  const response = await fetchImageUrl(image);
  if (!response?.ok || !response.body) {
    return new Response("Image not available", { status: response?.status || 404 });
  }

  return imageResponse(response.body, response.headers.get("content-type"));
}
