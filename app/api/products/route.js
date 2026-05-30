import { listProducts } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const products = await listProducts();
  return Response.json({ products });
}
