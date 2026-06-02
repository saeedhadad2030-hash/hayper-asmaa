import { isAdmin, unauthorized } from "@/lib/auth";
import { createCategory, deleteCategory, listCategories, updateCategory } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const categories = await listCategories();
  return Response.json({ categories });
}

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const name = String(body.name || "").trim();
  if (!name) return Response.json({ error: "اسم القسم مطلوب" }, { status: 400 });
  try {
    const category = await createCategory(name, Number(body.sortOrder) || 50);
    return Response.json({ category });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return Response.json({ error: "القسم موجود بالفعل" }, { status: 409 });
    }
    throw err;
  }
}

export async function PATCH(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const id = Number(body.id);
  if (!id) return Response.json({ error: "معرف القسم مطلوب" }, { status: 400 });
  const updates = {};
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.sortOrder !== undefined) updates.sortOrder = Number(body.sortOrder);
  await updateCategory(id, updates);
  return Response.json({ ok: true });
}

export async function DELETE(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const id = Number(body.id);
  if (!id) return Response.json({ error: "معرف القسم مطلوب" }, { status: 400 });
  await deleteCategory(id);
  return Response.json({ ok: true });
}
