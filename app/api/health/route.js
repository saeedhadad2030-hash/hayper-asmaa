import { getPasswordAudit } from "@/lib/auth";
import { countProductsWithImages, getSupabaseBaseUrl, hasSupabase, listProducts } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const result = {
    ok: true,
    hasSupabase: hasSupabase(),
    supabaseHost: null,
    productsCount: null,
    productsWithImages: null,
    passwordSetting: null,
    error: null
  };

  try {
    if (hasSupabase()) {
      result.supabaseHost = new URL(getSupabaseBaseUrl()).host;
    }

    const products = await listProducts();
    result.productsCount = products.length;
    result.productsWithImages = await countProductsWithImages();
    result.passwordSetting = await getPasswordAudit();
  } catch (error) {
    result.ok = false;
    result.error = String(error?.message || error);
  }

  return Response.json(result);
}
