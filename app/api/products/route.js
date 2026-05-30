import { listProductImages, listProducts } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(request) {
  const url = new URL(request.url);
  const ids = String(url.searchParams.get("ids") || "")
    .split(",")
    .map((id) => Number(id))
    .filter(Boolean);
  if (url.searchParams.get("images") === "1") {
    return Response.json(
      { images: await listProductImages(ids) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const products = await listProducts();
  return Response.json(
    { products },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300"
      }
    }
  );
}
