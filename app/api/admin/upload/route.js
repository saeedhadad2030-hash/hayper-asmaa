import { isAdmin, unauthorized } from "@/lib/auth";
import { uploadProductImageDataUrl } from "@/lib/product-images";

export const runtime = "nodejs";

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
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
