import { isAdmin, unauthorized } from "@/lib/auth";
import { uploadProductImageDataUrl } from "@/lib/product-images";
import { createProduct, deleteProduct, deleteProducts, ensureCategory, getProduct, listProducts, updateProduct } from "@/lib/store";

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
  const updatedAt = new Date().toISOString();
  const product = {
    name: String(body.name || "").trim(),
    category: String(body.category || "حلويات شريف الزيني").trim(),
    price: Number(body.price) || 0,
    originalPrice: Number(body.originalPrice) || null,
    offerActive: body.offerActive ? 1 : 0,
    variablePrice: body.variablePrice ? 1 : 0,
    available: body.available === false ? 0 : 1,
    stock: body.stock === null || body.stock === undefined || body.stock === "" ? null : Number(body.stock),
    image: body.image || null,
    updatedAt
  };
  await ensureCategory(product.category);
  const id = await createProduct(product);
  return Response.json({ product: { ...product, id: Number(id) } });
}

export async function PUT(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const existing = await getProduct(Number(body.id), { withImage: true });
  const updatedAt = new Date().toISOString();

  // Image logic:
  // 1. removeImage=true → clear image
  // 2. body.image is a new value (data URL or URL) → use it
  // 3. body.image is empty/null and no removeImage → keep existing
  let image;
  if (body.removeImage) {
    image = null;
  } else if (body.image && String(body.image).trim()) {
    image = body.image;
  } else {
    image = existing?.image ?? null;
  }

  const product = {
    id: Number(body.id),
    name: String(body.name || "").trim(),
    category: String(body.category || "حلويات شريف الزيني").trim(),
    price: Number(body.price) || 0,
    originalPrice: Number(body.originalPrice) || null,
    offerActive: body.offerActive ? 1 : 0,
    variablePrice: body.variablePrice ? 1 : 0,
    available: body.available ? 1 : 0,
    stock: body.stock === null || body.stock === undefined || body.stock === "" ? null : Number(body.stock),
    image,
    updatedAt
  };
  await ensureCategory(product.category);
  await updateProduct(product);
  return Response.json({ product });
}

function productKey(product) {
  return `${String(product.name || "").trim().replace(/\s+/g, " ").toLowerCase()}::${String(product.category || "").trim().replace(/\s+/g, " ").toLowerCase()}`;
}

function hasImage(product) {
  return Boolean(String(product.image || "").trim());
}

function hasDataUrlImage(product) {
  return String(product.image || "").startsWith("data:image/");
}

function sameProductData(first, second) {
  return (
    String(first.name || "") === String(second.name || "") &&
    String(first.category || "") === String(second.category || "") &&
    Number(first.price || 0) === Number(second.price || 0) &&
    Number(first.originalPrice || 0) === Number(second.originalPrice || 0) &&
    Boolean(first.offerActive) === Boolean(second.offerActive) &&
    Boolean(first.variablePrice) === Boolean(second.variablePrice) &&
    Boolean(first.available) === Boolean(second.available) &&
    String(first.image || "") === String(second.image || "")
  );
}

export async function PATCH(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  if (body.action === "removeImage") {
    const existing = await getProduct(Number(body.id), { withImage: true });
    if (!existing) return Response.json({ error: "المنتج غير موجود" }, { status: 404 });
    const product = {
      ...existing,
      image: null,
      updatedAt: new Date().toISOString()
    };
    await updateProduct(product);
    return Response.json({ ok: true, product });
  }

  if (body.action === "migrateImages") {
    const limit = Math.min(Math.max(Number(body.limit) || 8, 1), 12);
    const products = await listProducts({ admin: true, withImages: true });
    const dataUrlProducts = products.filter(hasDataUrlImage);
    const migratedProducts = [];

    for (const product of dataUrlProducts.slice(0, limit)) {
      const image = await uploadProductImageDataUrl(product.image);
      const migratedProduct = { ...product, image };
      await updateProduct(migratedProduct);
      migratedProducts.push(migratedProduct);
    }

    return Response.json({
      ok: true,
      migratedCount: migratedProducts.length,
      remainingCount: Math.max(0, dataUrlProducts.length - migratedProducts.length),
      migratedProducts
    });
  }
  if (body.action !== "dedupe") return Response.json({ error: "إجراء غير معروف" }, { status: 400 });

  const products = await listProducts({ admin: true, withImages: true });
  const groups = new Map();
  for (const product of products) {
    const key = productKey(product);
    if (!key.startsWith("::")) {
      groups.set(key, [...(groups.get(key) || []), product]);
    }
  }

  const deletedIds = [];
  const keptProducts = [];
  let duplicateGroups = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    duplicateGroups += 1;
    const newestFirst = [...group].sort((a, b) => Number(b.id) - Number(a.id));
    const keeper = newestFirst.find(hasImage) || newestFirst[0];
    const latest = newestFirst[0];
    const mergedProduct = {
      ...latest,
      id: Number(keeper.id),
      image: keeper.image || latest.image || null,
      originalPrice: Number(latest.originalPrice) || null,
      offerActive: latest.offerActive ? 1 : 0,
      variablePrice: latest.variablePrice ? 1 : 0,
      available: latest.available ? 1 : 0
    };
    const idsToDelete = group
      .map((product) => Number(product.id))
      .filter((id) => id && id !== Number(keeper.id));

    if (!sameProductData(keeper, mergedProduct)) {
      await updateProduct(mergedProduct);
    }
    await deleteProducts(idsToDelete);
    deletedIds.push(...idsToDelete);
    keptProducts.push(mergedProduct);
  }

  return Response.json({
    ok: true,
    duplicateGroups,
    deletedCount: deletedIds.length,
    deletedIds,
    keptProducts
  });
}

export async function DELETE(request) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await request.json();
  await deleteProduct(Number(id));
  return Response.json({ ok: true });
}
