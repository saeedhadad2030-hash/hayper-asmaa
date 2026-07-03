import { getPasswordAudit } from "@/lib/auth";
import { countProductsWithImages, getSupabaseBaseUrl, hasSupabase, listProducts } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  let cfEnvKeys = [];
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const cf = getCloudflareContext({ async: false });
    if (cf?.env) cfEnvKeys = Object.keys(cf.env);
  } catch (e) {
    // ignore if not in cloudflare context
  }

  const result = {
    ok: true,
    hasSupabase: hasSupabase(),
    envSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    envServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    envPassword: Boolean(process.env.ADMIN_PASSWORD),
    processEnvKeys: Object.keys(process.env).filter(k => k.includes("SUPA") || k.includes("ADMIN") || k.includes("WHATSAPP")),
    cfEnvKeys: cfEnvKeys.filter(k => k.includes("SUPA") || k.includes("ADMIN") || k.includes("WHATSAPP")),
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
