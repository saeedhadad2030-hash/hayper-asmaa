import { isAdmin, unauthorized } from "@/lib/auth";
import { uploadProductImageDataUrl } from "@/lib/product-images";
import { hasSupabase } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  if (!hasSupabase()) {
    return Response.json({ error: "Supabase غير متصل" }, { status: 500 });
  }

  const body = await request.json();
  try {
    const url = await uploadProductImageDataUrl(body.image);
    return Response.json({ url });
  } catch (error) {
    return Response.json({ error: error.message || "تعذر رفع الصورة" }, { status: 400 });
  }
}
