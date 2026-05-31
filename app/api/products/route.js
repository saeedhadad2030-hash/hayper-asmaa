import { listProducts } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const products = await listProducts({ withImages: true });
  return Response.json(
    { products },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
