"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ImagePlus,
  LogOut,
  PackagePlus,
  Pencil,
  Save,
  Trash2,
  X
} from "lucide-react";
import { money, ORDER_STATUSES, PAYMENT, readOrderItems } from "@/lib/shop";

const blankProduct = {
  id: null,
  name: "",
  category: "حلويات شريف الزيني",
  price: "",
  originalPrice: "",
  offerActive: false,
  variablePrice: false,
  available: true,
  image: ""
};

const ADMIN_PRODUCT_BATCH_SIZE = 80;
const ADMIN_PRODUCTS_CACHE_KEY = "hyperAdminProductsCache";

function stripProductImages(products) {
  return products.map(({ image, _imageChecked, ...product }) => product);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function resizeImage(file, maxSize = 900, quality = 0.74) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function normalizeProductForState(product) {
  return {
    ...product,
    price: Number(product.price) || 0,
    originalPrice: product.originalPrice == null ? "" : Number(product.originalPrice),
    offerActive: Boolean(product.offerActive),
    variablePrice: Boolean(product.variablePrice),
    available: Boolean(product.available)
  };
}

function cacheAdminProducts(products) {
  try {
    localStorage.setItem(ADMIN_PRODUCTS_CACHE_KEY, JSON.stringify(stripProductImages(products)));
  } catch {}
}

export default function AdminAccess({ embedded = false, onClose }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/session")
      .then((res) => res.json())
      .then((data) => {
        setAuthenticated(Boolean(data.authenticated));
        setChecking(false);
      });
  }, []);

  async function login(event) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    if (!response.ok) {
      setError("كلمة المرور غير صحيحة");
      return;
    }
    setAuthenticated(true);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
  }

  const frameClass = embedded ? "admin-embedded" : "admin-standalone";

  return (
    <section className={frameClass} dir="rtl">
      {embedded && (
        <button className="admin-close" onClick={onClose} aria-label="إغلاق لوحة الإدارة">
          <X size={20} />
        </button>
      )}
      {checking ? (
        <p className="admin-loading">جاري التحميل...</p>
      ) : authenticated ? (
        <AdminDashboard onLogout={logout} />
      ) : (
        <form className="admin-login-form" onSubmit={login}>
          <div className="admin-logo">هايبر أسماء</div>
          <h1>دخول لوحة الإدارة</h1>
          <label>
            كلمة المرور
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
          </label>
          {error && <p>{error}</p>}
          <button>دخول</button>
        </form>
      )}
    </section>
  );
}

function AdminDashboard({ onLogout }) {
  const [products, setProducts] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState("");
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [productLimit, setProductLimit] = useState(ADMIN_PRODUCT_BATCH_SIZE);
  const [productForm, setProductForm] = useState(blankProduct);
  const [saving, setSaving] = useState(false);
  const [productActionError, setProductActionError] = useState("");
  const [dedupeMessage, setDedupeMessage] = useState("");
  const [deduping, setDeduping] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const requestedImageIds = useRef(new Set());
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordAudit, setPasswordAudit] = useState(null);

  useEffect(() => {
    try {
      const cachedProducts = JSON.parse(localStorage.getItem(ADMIN_PRODUCTS_CACHE_KEY) || "[]");
      if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
        setProducts(stripProductImages(cachedProducts).map(normalizeProductForState));
        setDashboardLoading(false);
      }
    } catch {
      localStorage.removeItem(ADMIN_PRODUCTS_CACHE_KEY);
    }
    refreshAll();
  }, []);

  useEffect(() => {
    setProductLimit(ADMIN_PRODUCT_BATCH_SIZE);
  }, [productSearch]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((product) => product.category))),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return products;
    return products.filter((product) =>
      `${product.name} ${product.category}`.toLowerCase().includes(search)
    );
  }, [products, productSearch]);

  const displayedAdminProducts = filteredProducts.slice(0, productLimit);

  useEffect(() => {
    const missingIds = displayedAdminProducts
      .filter((product) => !product.image && !product._imageChecked && !requestedImageIds.current.has(Number(product.id)))
      .slice(0, 24)
      .map((product) => Number(product.id));
    if (missingIds.length === 0) return;

    missingIds.forEach((id) => requestedImageIds.current.add(id));
    let active = true;
    fetch(`/api/admin/products?images=1&ids=${missingIds.join(",")}`)
      .then((res) => {
        if (!res.ok) throw new Error("Images request failed");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        const imageMap = new Map((data.images || []).map((item) => [Number(item.id), item.image || ""]));
        updateProductsState((current) =>
          current.map((product) =>
            missingIds.includes(Number(product.id))
              ? { ...product, image: imageMap.get(Number(product.id)) || "", _imageChecked: true }
              : product
          )
        );
      })
      .catch(() => {
        if (!active) return;
        updateProductsState((current) =>
          current.map((product) =>
            missingIds.includes(Number(product.id)) ? { ...product, _imageChecked: true } : product
          )
        );
      });

    return () => {
      active = false;
    };
  }, [displayedAdminProducts]);

  function updateProductsState(updater) {
    setProducts((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      cacheAdminProducts(next);
      return next;
    });
  }

  async function refreshAll({ silent = false } = {}) {
    if (!silent && products.length === 0) setDashboardLoading(true);
    setDashboardError("");

    const productLoad = fetch("/api/admin/products")
      .then((res) => res.json())
      .then((productData) => {
        const nextProducts = (productData.products || []).map(normalizeProductForState);
        updateProductsState(nextProducts);
      })
      .catch(() => {
        setDashboardError("تعذر تحميل منتجات لوحة الإدارة. جرب تحديث الصفحة.");
      })
      .finally(() => {
        setDashboardLoading(false);
      });

    const metaLoad = Promise.all([
      fetch("/api/admin/orders"),
      fetch("/api/admin/stats"),
      fetch("/api/admin/password")
    ])
      .then(([orderRes, statsRes, passwordRes]) =>
        Promise.all([orderRes.json(), statsRes.json(), passwordRes.json()])
      )
      .then(([orderData, statsData, passwordData]) => {
      setOrders(orderData.orders || []);
      setStats(statsData.stats || null);
      setPasswordAudit(passwordData || null);
      })
      .catch(() => {});

    await Promise.allSettled([productLoad, metaLoad]);
  }

  async function saveProduct(event) {
    event.preventDefault();
    setProductActionError("");
    setSaving(true);
    try {
      const editing = Boolean(productForm.id);
      const response = await fetch("/api/admin/products", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(productForm)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ المنتج");
      const savedProduct = normalizeProductForState(data.product);
      updateProductsState((current) =>
        editing
          ? current.map((product) => (product.id === savedProduct.id ? savedProduct : product))
          : [savedProduct, ...current]
      );
      setProductForm(blankProduct);
    } catch (err) {
      setProductActionError(err.message || "تعذر حفظ المنتج");
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id) {
    const removedProduct = products.find((product) => product.id === id);
    if (!removedProduct) return;
    setProductActionError("");
    setDeletingIds((current) => new Set(current).add(id));
    updateProductsState((current) => current.filter((product) => product.id !== id));
    if (productForm.id === id) setProductForm(blankProduct);
    try {
      const response = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "تعذر حذف المنتج");
      }
    } catch (err) {
      updateProductsState((current) =>
        current.some((product) => product.id === id) ? current : [removedProduct, ...current]
      );
      setProductActionError(err.message || "تعذر حذف المنتج");
    } finally {
      setDeletingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function editProduct(product) {
    const baseProduct = {
      ...product,
      originalPrice: product.originalPrice || "",
      offerActive: Boolean(product.offerActive),
      variablePrice: Boolean(product.variablePrice),
      available: Boolean(product.available)
    };
    setProductForm(baseProduct);
    if (product.image || product._imageChecked) return;
    try {
      const response = await fetch(`/api/admin/products?images=1&ids=${Number(product.id)}`);
      const data = await response.json();
      const image = data.images?.[0]?.image || "";
      setProductForm((current) => (current.id === product.id ? { ...current, image } : current));
      updateProductsState((current) =>
        current.map((item) => (item.id === product.id ? { ...item, image, _imageChecked: true } : item))
      );
    } catch {}
  }

  async function dedupeProducts() {
    if (!window.confirm("تنضيف المكرر هيمسح النسخ الزيادة ويحتفظ بالنسخة الأفضل، خصوصا اللي فيها صورة. تكمل؟")) {
      return;
    }
    setProductActionError("");
    setDedupeMessage("");
    setDeduping(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dedupe" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تنضيف المنتجات المكررة");

      const deletedIds = new Set(data.deletedIds || []);
      const keptProducts = new Map(
        (data.keptProducts || []).map((product) => [Number(product.id), normalizeProductForState(product)])
      );
      updateProductsState((current) =>
        current
          .filter((product) => !deletedIds.has(Number(product.id)))
          .map((product) => keptProducts.get(Number(product.id)) || product)
      );
      setProductForm(blankProduct);
      setDedupeMessage(
        data.deletedCount > 0
          ? `تم حذف ${data.deletedCount} منتج مكرر من ${data.duplicateGroups} مجموعة.`
          : "مفيش منتجات مكررة بنفس الاسم والقسم."
      );
    } catch (err) {
      setProductActionError(err.message || "تعذر تنضيف المنتجات المكررة");
    } finally {
      setDeduping(false);
    }
  }

  async function handleProductImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file).catch(() => fileToDataUrl(file));
    setProductForm((current) => ({ ...current, image: dataUrl }));
  }

  async function updateOrder(order, updates) {
    const nextOrder = { ...order, ...updates };
    setOrders((current) => current.map((item) => (item.id === order.id ? nextOrder : item)));
    try {
      const response = await fetch("/api/admin/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, status: order.status, deliveryFee: order.deliveryFee, ...updates })
      });
      if (!response.ok) throw new Error("تعذر تحديث الطلب");
    } catch {
      setOrders((current) => current.map((item) => (item.id === order.id ? order : item)));
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPasswordMessage("");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage("تأكيد الباسورد غير مطابق");
      return;
    }
    const response = await fetch("/api/admin/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(passwordForm)
    });
    const data = await response.json();
    if (!response.ok) {
      setPasswordMessage(data.error || "تعذر تغيير الباسورد");
      return;
    }
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordMessage("تم تغيير الباسورد بنجاح");
    await refreshAll({ silent: true });
  }

  return (
    <div className="admin-page-inner">
      <header className="admin-header">
        <div>
          <span>لوحة إدارة</span>
          <h1>هايبر أسماء</h1>
        </div>
        <button onClick={onLogout}>
          <LogOut size={18} />
          خروج
        </button>
      </header>

      <section className="stats-grid">
        <StatCard icon={BarChart3} label="إجمالي الطلبات" value={stats?.totalOrders || 0} />
        <StatCard icon={CheckCircle2} label="طلبات مؤكدة" value={stats?.confirmedOrders || 0} />
        <StatCard icon={BarChart3} label="إجمالي المبيعات" value={money(stats?.sales || 0)} />
        <StatCard icon={BarChart3} label="نسبة التأكيد" value={`${stats?.conversionRate || 0}%`} />
      </section>

      <section className="admin-layout">
        <div className="admin-side-stack">
          <form className="product-editor" onSubmit={saveProduct}>
            <h2>
              <PackagePlus size={20} />
              {productForm.id ? "تعديل منتج" : "إضافة منتج"}
            </h2>
            <label>
              اسم المنتج
              <input
                value={productForm.name}
                onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
                required
              />
            </label>
            <label>
              القسم
              <input
                value={productForm.category}
                list="categories"
                onChange={(event) => setProductForm({ ...productForm, category: event.target.value })}
                required
              />
              <datalist id="categories">
                {categories.map((category) => <option key={category} value={category} />)}
              </datalist>
            </label>
            <label>
              سعر البيع الحالي
              <input
                type="number"
                min="0"
                value={productForm.price}
                onChange={(event) => setProductForm({ ...productForm, price: event.target.value })}
                required
              />
            </label>
            <label>
              السعر قبل العرض
              <input
                type="number"
                min="0"
                value={productForm.originalPrice || ""}
                onChange={(event) => setProductForm({ ...productForm, originalPrice: event.target.value })}
                placeholder="مثال: 100"
              />
            </label>
            <div className="toggle-row">
              <label>
                <input
                  type="checkbox"
                  checked={productForm.available}
                  onChange={(event) => setProductForm({ ...productForm, available: event.target.checked })}
                />
                متاح للبيع
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={productForm.variablePrice}
                  onChange={(event) => setProductForm({ ...productForm, variablePrice: event.target.checked })}
                />
                يسمح بتحديد مبلغ
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(productForm.offerActive)}
                  onChange={(event) => setProductForm({ ...productForm, offerActive: event.target.checked })}
                />
                تفعيل عرض: السعر الجديد بدل القديم
              </label>
            </div>
            <label className="image-input">
              <ImagePlus size={18} />
              رفع صورة المنتج
              <input type="file" accept="image/*" onChange={handleProductImage} />
            </label>
            {productForm.image && <img className="admin-preview" src={productForm.image} alt="معاينة المنتج" />}
            <div className="form-actions">
              <button className="primary-action" disabled={saving}>
                <Save size={18} />
                {saving ? "جاري الحفظ..." : "حفظ المنتج"}
              </button>
              {productForm.id && (
                <button type="button" onClick={() => setProductForm(blankProduct)}>
                  إلغاء
                </button>
              )}
            </div>
          </form>

          <form className="password-editor" onSubmit={changePassword}>
            <h2>تغيير باسورد الإدارة</h2>
            <label>
              الباسورد الحالي
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
                required
              />
            </label>
            <label>
              الباسورد الجديد
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
                required
              />
            </label>
            <label>
              تأكيد الباسورد الجديد
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
                required
              />
            </label>
            <small>
              آخر تحديث: {passwordAudit?.passwordUpdatedAt || "غير معروف"} - مرات التسجيل: {passwordAudit?.audit || 0}
            </small>
            {passwordMessage && <p>{passwordMessage}</p>}
            <button className="primary-action">تغيير الباسورد</button>
          </form>
        </div>

        <section className="admin-products">
          <div className="admin-products-head">
            <h2>المنتجات</h2>
            <button type="button" onClick={dedupeProducts} disabled={deduping || dashboardLoading}>
              {deduping ? "جاري التنضيف..." : "تنضيف المكرر"}
            </button>
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="ابحث باسم المنتج أو القسم"
            />
          </div>
          {productActionError && <p className="admin-action-error">{productActionError}</p>}
          {dedupeMessage && <p className="admin-action-success">{dedupeMessage}</p>}
          <div className="admin-list">
            {dashboardLoading && (
              <p className="admin-empty">جاري تحميل المنتجات...</p>
            )}
            {!dashboardLoading && dashboardError && (
              <p className="admin-empty">{dashboardError}</p>
            )}
            {!dashboardLoading && !dashboardError && displayedAdminProducts.map((product) => (
              <article key={product.id} className={!product.available ? "muted" : ""}>
                {product.image ? <img src={product.image} alt={product.name} loading="lazy" decoding="async" /> : <span className="tiny-placeholder" />}
                <div>
                  <strong>{product.name}</strong>
                  <span>
                    {product.category} - {money(product.price)}
                    {Boolean(product.offerActive) && Number(product.originalPrice) > Number(product.price)
                      ? ` بدل ${money(product.originalPrice)}`
                      : ""}
                  </span>
                  {!product.available && <em>Sold Out</em>}
                </div>
                <button onClick={() => editProduct(product)}>
                  <Pencil size={16} />
                </button>
                <button onClick={() => deleteProduct(product.id)} disabled={deletingIds.has(product.id)}>
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
            {!dashboardLoading && !dashboardError && filteredProducts.length === 0 && (
              <p className="admin-empty">مفيش منتجات مطابقة للبحث.</p>
            )}
            {!dashboardLoading && !dashboardError && productLimit < filteredProducts.length && (
              <button
                className="admin-load-more"
                type="button"
                onClick={() => setProductLimit((limit) => limit + ADMIN_PRODUCT_BATCH_SIZE)}
              >
                عرض منتجات أكتر
              </button>
            )}
          </div>
        </section>
      </section>

      <section className="orders-section">
        <h2>الطلبات</h2>
        <div className="orders-grid">
          {orders.map((order) => (
            <article className="order-card" key={order.id}>
              <div className="order-head">
                <strong>طلب #{order.id}</strong>
                <span>{order.status}</span>
              </div>
              <p>{order.customerName} - {order.phone}</p>
              <p>{order.address}</p>
              <ul>
                {(Array.isArray(order.items) ? order.items : readOrderItems(order.items)).map((item) => (
                  <li key={`${order.id}-${item.id}-${item.unitPrice}`}>
                    {item.name} × {item.quantity} - {money(item.lineTotal)}
                  </li>
                ))}
              </ul>
              <div className="order-money">
                <span>الإجمالي: {money(order.subtotal)}</span>
                <span>العربون: {money(Number(order.deposit) + Number(order.fee))}</span>
                <span>الدفع: {PAYMENT[order.paymentMethod]?.label} - {order.paymentNumber}</span>
                <span>التوصيل المتوقع: {order.deliveryDate}</span>
              </div>
              {order.receiptImage && (
                <div className="receipt-preview">
                  <img src={order.receiptImage} alt={`إيصال تحويل طلب ${order.id}`} />
                  <div>
                    <strong>إيصال التحويل</strong>
                    <a className="receipt-link" href={order.receiptImage} target="_blank">
                      فتح الصورة بحجم كامل
                    </a>
                  </div>
                </div>
              )}
              <div className="order-controls">
                <select value={order.status} onChange={(event) => updateOrder(order, { status: event.target.value })}>
                  {ORDER_STATUSES.map((status) => <option key={status}>{status}</option>)}
                </select>
                <input
                  type="number"
                  placeholder="تكلفة التوصيل"
                  defaultValue={order.deliveryFee ?? ""}
                  onBlur={(event) => updateOrder(order, { deliveryFee: event.target.value })}
                />
                <button onClick={() => updateOrder(order, { status: "مؤكد" })}>تأكيد يدوي</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="top-products">
        <h2>الأكثر طلبا</h2>
        {(stats?.topProducts || []).length === 0 ? (
          <p>لسه مفيش طلبات مؤكدة كفاية.</p>
        ) : (
          stats.topProducts.map((product) => (
            <div key={product.name}>
              <span>{product.name}</span>
              <strong>{product.quantity}</strong>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <article className="stat-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
