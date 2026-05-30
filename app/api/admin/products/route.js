import { isAdmin, unauthorized } from "@/lib/auth";
import { createProduct, deleteProduct, listProducts, updateProduct } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json({
    products: await listProducts({ admin: true })
  });
}

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const id = await createProduct({
    name: String(body.name || "").trim(),
    category: String(body.category || "حلويات شريف الزيني").trim(),
    price: Number(body.price) || 0,
    originalPrice: Number(body.originalPrice) || null,
    offerActive: body.offerActive ? 1 : 0,
    variablePrice: body.variablePrice ? 1 : 0,
    available: body.available === false ? 0 : 1,
    image: body.image || null
  });
  return Response.json({ id: Number(id) });
}

export async function PUT(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  await updateProduct({
    id: Number(body.id),
    name: String(body.name || "").trim(),
    category: String(body.category || "حلويات شريف الزيني").trim(),
    price: Number(body.price) || 0,
    originalPrice: Number(body.originalPrice) || null,
    offerActive: body.offerActive ? 1 : 0,
    variablePrice: body.variablePrice ? 1 : 0,
    available: body.available ? 1 : 0,
    image: body.image || null
  });
  return Response.json({ ok: true });
}

export async function DELETE(request) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await request.json();
  await deleteProduct(Number(id));
  return Response.json({ ok: true });
}
