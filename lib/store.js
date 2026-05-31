const PRODUCT_COLUMNS = "id,name,category,price,originalPrice,offerActive,variablePrice,available";
const PRODUCT_COLUMNS_WITH_IMAGE = `${PRODUCT_COLUMNS},image`;
const ORDER_COLUMNS = "id,customerName,phone,address,notes,items,subtotal,deposit,fee,paymentMethod,paymentNumber,receiptImage,status,deliveryDate,deliveryFee,createdAt,updatedAt";
const STORAGE_PUBLIC_PREFIX = "/storage/v1/object/public/";

export function hasSupabase() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseBaseUrl() {
  return String(process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
}

function supabaseHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}

async function supabase(path, options = {}) {
  const url = `${getSupabaseBaseUrl()}/rest/v1/${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 9000));
  const response = await fetch(url, {
    ...options,
    signal: options.signal || controller.signal,
    headers: supabaseHeaders(options.headers)
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase error ${response.status}: ${text.slice(0, 500)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function sqlite() {
  return import("@/lib/db");
}

function normalizeProductImage(image) {
  const value = String(image || "").trim();
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith(STORAGE_PUBLIC_PREFIX)) return `${getSupabaseBaseUrl()}${value}`;
  if (value.startsWith("product-images/")) {
    return `${getSupabaseBaseUrl()}${STORAGE_PUBLIC_PREFIX}${value}`;
  }
  return value;
}

function normalizeProduct(product) {
  if (!product || !("image" in product)) return product;
  return {
    ...product,
    image: normalizeProductImage(product.image)
  };
}

export async function listProducts({ admin = false, withImages = false } = {}) {
  const columns = withImages ? PRODUCT_COLUMNS_WITH_IMAGE : PRODUCT_COLUMNS;
  let products;
  if (hasSupabase()) {
    const order = admin ? "id.desc" : "category.asc,id.asc";
    products = await supabase(`products?select=${columns}&order=${order}`);
  } else {
    const { rows } = await sqlite();
    products = rows(`
      SELECT ${columns}
      FROM products
      ORDER BY ${admin ? "id DESC" : "category, id"}
    `);
  }
  return withImages ? products.map(normalizeProduct) : products;
}

export async function getProduct(id, { withImage = false } = {}) {
  const columns = withImage ? PRODUCT_COLUMNS_WITH_IMAGE : PRODUCT_COLUMNS;
  let product;
  if (hasSupabase()) {
    const data = await supabase(`products?select=${columns}&id=eq.${Number(id)}&limit=1`);
    product = data[0] || null;
  } else {
    const { row } = await sqlite();
    product = row(`SELECT ${columns} FROM products WHERE id = ?`, Number(id));
  }
  return withImage ? normalizeProduct(product) : product;
}

export async function countProductsWithImages() {
  if (hasSupabase()) {
    const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/products?select=id&image=not.is.null`, {
      method: "HEAD",
      headers: supabaseHeaders({ Prefer: "count=exact" })
    });
    if (!response.ok) return 0;
    return Number(response.headers.get("content-range")?.split("/")?.[1] || 0);
  }
  const { row } = await sqlite();
  return Number(row("SELECT COUNT(*) AS count FROM products WHERE image IS NOT NULL AND image != ''")?.count || 0);
}

export async function createProduct(product) {
  if (hasSupabase()) {
    const data = await supabase("products", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(product)
    });
    return data[0]?.id;
  }
  const { run } = await sqlite();
  const result = run(
    `
      INSERT INTO products (name, category, price, originalPrice, offerActive, variablePrice, available, image, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    product.name,
    product.category,
    product.price,
    product.originalPrice || null,
    product.offerActive ? 1 : 0,
    product.variablePrice ? 1 : 0,
    product.available ? 1 : 0,
    product.image || null
  );
  return Number(result.lastInsertRowid);
}

export async function updateProduct(product) {
  if (hasSupabase()) {
    await supabase(`products?id=eq.${Number(product.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...product, updatedAt: new Date().toISOString() })
    });
    return;
  }
  const { run } = await sqlite();
  run(
    `
      UPDATE products
      SET name = ?, category = ?, price = ?, originalPrice = ?, offerActive = ?, variablePrice = ?, available = ?, image = ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    product.name,
    product.category,
    product.price,
    product.originalPrice || null,
    product.offerActive ? 1 : 0,
    product.variablePrice ? 1 : 0,
    product.available ? 1 : 0,
    product.image || null,
    Number(product.id)
  );
}

export async function deleteProduct(id) {
  if (hasSupabase()) {
    await supabase(`products?id=eq.${Number(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    return;
  }
  const { run } = await sqlite();
  run("DELETE FROM products WHERE id = ?", Number(id));
}

export async function deleteProducts(ids) {
  const cleanIds = Array.from(new Set(ids.map((id) => Number(id)).filter(Boolean)));
  if (cleanIds.length === 0) return;
  if (hasSupabase()) {
    await supabase(`products?id=in.(${cleanIds.join(",")})`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    return;
  }
  const { run } = await sqlite();
  for (const id of cleanIds) {
    run("DELETE FROM products WHERE id = ?", id);
  }
}

export async function createOrder(order) {
  if (hasSupabase()) {
    const data = await supabase("orders", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        ...order,
        items: typeof order.items === "string" ? JSON.parse(order.items) : order.items
      })
    });
    return data[0]?.id;
  }
  const { run } = await sqlite();
  const result = run(
    `
      INSERT INTO orders (
        customerName, phone, address, notes, items, subtotal, deposit, fee,
        paymentMethod, paymentNumber, receiptImage, status, deliveryDate
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    order.customerName,
    order.phone,
    order.address,
    order.notes,
    order.items,
    order.subtotal,
    order.deposit,
    order.fee,
    order.paymentMethod,
    order.paymentNumber,
    order.receiptImage || null,
    order.status,
    order.deliveryDate
  );
  return Number(result.lastInsertRowid);
}

export async function listOrders() {
  if (hasSupabase()) {
    return supabase(`orders?select=${ORDER_COLUMNS}&order=id.desc`);
  }
  const { rows } = await sqlite();
  return rows("SELECT * FROM orders ORDER BY id DESC");
}

export async function updateOrder(id, updates) {
  if (hasSupabase()) {
    await supabase(`orders?id=eq.${Number(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...updates, updatedAt: new Date().toISOString() })
    });
    return;
  }
  const { run } = await sqlite();
  run(
    "UPDATE orders SET status = ?, deliveryFee = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?",
    updates.status,
    updates.deliveryFee,
    Number(id)
  );
}

export async function getSetting(key) {
  if (hasSupabase()) {
    const data = await supabase(`settings?select=key,value,updatedAt&key=eq.${encodeURIComponent(key)}&limit=1`);
    return data[0] || null;
  }
  const { row } = await sqlite();
  return row("SELECT key, value, updatedAt FROM settings WHERE key = ?", key) || null;
}

export async function setSetting(key, value) {
  if (hasSupabase()) {
    await supabase("settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key, value, updatedAt: new Date().toISOString() })
    });
    return;
  }
  const { run } = await sqlite();
  const existing = await getSetting(key);
  if (existing) {
    run("UPDATE settings SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE key = ?", value, key);
  } else {
    run("INSERT INTO settings (key, value, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP)", key, value);
  }
}

export async function addPasswordAudit(note) {
  if (hasSupabase()) {
    await supabase("password_audit", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ note })
    });
    return;
  }
  const { run } = await sqlite();
  run("INSERT INTO password_audit (note) VALUES (?)", note);
}

export async function countPasswordAudit() {
  if (hasSupabase()) {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/password_audit?select=id`, {
      method: "HEAD",
      headers: supabaseHeaders({ Prefer: "count=exact" })
    });
    if (!response.ok) return 0;
    return Number(response.headers.get("content-range")?.split("/")?.[1] || 0);
  }
  const { row } = await sqlite();
  return Number(row("SELECT COUNT(*) AS count FROM password_audit")?.count || 0);
}
