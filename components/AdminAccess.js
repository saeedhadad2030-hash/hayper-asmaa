"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  FolderPlus,
  ImagePlus,
  LogOut,
  PackagePlus,
  Pencil,
  Save,
  Trash2,
  X,
  ArrowUp,
  ArrowDown,
  Package
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
  stock: "",
  stockMode: "unlimited",
  image: "",
  removeImage: false
};

const ADMIN_PRODUCT_BATCH_SIZE = 80;
const ADMIN_PRODUCTS_CACHE_KEY = "hyperAdminProductsCache:v4";
const SHOP_PRODUCTS_CACHE_KEY = "hyperProductsCache:v4";

function mergeProductImages(previousProducts, nextProducts) {
  const previousImages = new Map(
    previousProducts
      .filter((product) => product.image)
      .map((product) => [Number(product.id), product.image])
  );
  return nextProducts.map((product) => ({
    ...product,
    image: product.image || previousImages.get(Number(product.id)) || ""
  }));
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
    available: Boolean(product.available),
    stock: product.stock === null || product.stock === undefined ? "" : Number(product.stock),
    stockMode: product.stock === null || product.stock === undefined ? "unlimited" : "limited"
  };
}

function cacheAdminProducts(products) {
  try {
    localStorage.setItem(ADMIN_PRODUCTS_CACHE_KEY, JSON.stringify(products));
  } catch {}
}

function clearShopProductsCache() {
  try {
    localStorage.removeItem("hyperProductsCache");
    localStorage.removeItem("hyperProductsCache:v3");
    localStorage.removeItem(SHOP_PRODUCTS_CACHE_KEY);
  } catch {}
}

async function uploadProductImageIfNeeded(image) {
  if (!String(image || "").startsWith("data:image/")) return image || "";
  const response = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "تعذر رفع صورة المنتج");
  return data.url;
}

// Lazy thumbnail for admin list
function AdminProductThumb({ product }) {
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px 0px", threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (failed) return <span ref={ref} className="tiny-placeholder" />;
  return visible ? (
    <img
      ref={ref}
      src={`/api/product-image/${product.id}?size=thumb&v=${encodeURIComponent(product.updatedAt || "")}`}
      alt={product.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <span ref={ref} className="tiny-placeholder shimmer" />
  );
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
  const [imageMigrationMessage, setImageMigrationMessage] = useState("");
  const [migratingImages, setMigratingImages] = useState(false);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordAudit, setPasswordAudit] = useState(null);

  // Category management state
  const [categoriesList, setCategoriesList] = useState([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategorySortOrder, setNewCategorySortOrder] = useState("");
  const [categoryMessage, setCategoryMessage] = useState("");
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    try {
      localStorage.removeItem("hyperAdminProductsCache");
      const cachedProducts = JSON.parse(localStorage.getItem(ADMIN_PRODUCTS_CACHE_KEY) || "[]");
      if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
        setProducts(cachedProducts.map(normalizeProductForState));
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
        updateProductsState((current) => mergeProductImages(current, nextProducts));
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
      fetch("/api/admin/password"),
      fetch("/api/admin/categories")
    ])
      .then(([orderRes, statsRes, passwordRes, catRes]) =>
        Promise.all([orderRes.json(), statsRes.json(), passwordRes.json(), catRes.json()])
      )
      .then(([orderData, statsData, passwordData, catData]) => {
      setOrders(orderData.orders || []);
      setStats(statsData.stats || null);
      setPasswordAudit(passwordData || null);
      setCategoriesList(catData.categories || []);
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
      const stockValue = productForm.stockMode === "limited" ? (productForm.stock === "" ? 0 : Number(productForm.stock)) : null;
      const image = productForm.removeImage ? "" : await uploadProductImageIfNeeded(productForm.image);
      const payload = {
        ...productForm,
        stock: stockValue,
        image,
        removeImage: Boolean(productForm.removeImage)
      };
      delete payload.stockMode;
      const response = await fetch("/api/admin/products", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      let data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر حفظ المنتج");
      if (editing && productForm.removeImage) {
        const removeResponse = await fetch("/api/admin/products", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "removeImage", id: productForm.id })
        });
        const removeData = await removeResponse.json();
        if (!removeResponse.ok) throw new Error(removeData.error || "تعذر إزالة صورة المنتج");
        data = removeData;
      }
      const savedProduct = normalizeProductForState({
        ...data.product,
        image: productForm.removeImage ? "" : data.product.image,
        removeImage: false
      });
      updateProductsState((current) =>
        editing
          ? current.map((product) => (product.id === savedProduct.id ? savedProduct : product))
          : [savedProduct, ...current]
      );
      clearShopProductsCache();
      setProductForm(blankProduct);
      // Refresh categories in case a new one was created
      refreshCategories();
    } catch (err) {
      setProductActionError(err.message || "تعذر حفظ المنتج");
    } finally {
      setSaving(false);
    }
  }

  async function refreshCategories() {
    try {
      const res = await fetch("/api/admin/categories");
      const data = await res.json();
      setCategoriesList(data.categories || []);
    } catch {}
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
      clearShopProductsCache();
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

  function editProduct(product) {
    setProductForm({
      ...product,
      image: product.image || "",
      removeImage: false,
      originalPrice: product.originalPrice || "",
      offerActive: Boolean(product.offerActive),
      variablePrice: Boolean(product.variablePrice),
      available: Boolean(product.available),
      stock: product.stock === null || product.stock === undefined || product.stock === "" ? "" : Number(product.stock),
      stockMode: product.stock === null || product.stock === undefined || product.stock === "" ? "unlimited" : "limited"
    });
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

  async function migrateLegacyImages() {
    setProductActionError("");
    setImageMigrationMessage("");
    setMigratingImages(true);
    try {
      const response = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "migrateImages", limit: 8 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر تحويل الصور لروابط خفيفة");

      const migratedProducts = new Map(
        (data.migratedProducts || []).map((product) => [Number(product.id), normalizeProductForState(product)])
      );
      updateProductsState((current) =>
        current.map((product) => migratedProducts.get(Number(product.id)) || product)
      );
      setImageMigrationMessage(
        data.migratedCount > 0
          ? `تم تحويل ${data.migratedCount} صورة. المتبقي ${data.remainingCount}. كرر الضغط لحد ما المتبقي يبقى 0.`
          : "كل الصور بالفعل خفيفة ومرفوعة كرابط."
      );
    } catch (err) {
      setProductActionError(err.message || "تعذر تحويل الصور لروابط خفيفة");
    } finally {
      setMigratingImages(false);
    }
  }

  async function handleProductImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImage(file).catch(() => fileToDataUrl(file));
    setProductForm((current) => ({ ...current, image: dataUrl, removeImage: false }));
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

  // Category management
  async function addCategory(event) {
    event.preventDefault();
    if (!newCategoryName.trim()) return;
    setCategoryMessage("");
    setSavingCategory(true);
    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim(), sortOrder: Number(newCategorySortOrder) || 50 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر إضافة القسم");
      setCategoriesList((current) => [...current, data.category].sort((a, b) => a.sortOrder - b.sortOrder));
      setNewCategoryName("");
      setNewCategorySortOrder("");
      setCategoryMessage("تم إضافة القسم بنجاح");
    } catch (err) {
      setCategoryMessage(err.message || "تعذر إضافة القسم");
    } finally {
      setSavingCategory(false);
    }
  }

  async function updateCategorySortOrder(catId, newOrder) {
    setCategoriesList((current) =>
      current.map((c) => (c.id === catId ? { ...c, sortOrder: newOrder } : c)).sort((a, b) => a.sortOrder - b.sortOrder)
    );
    try {
      await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: catId, sortOrder: newOrder })
      });
    } catch {}
  }

  async function removeCategory(catId) {
    if (!window.confirm("حذف القسم لن يحذف المنتجات الموجودة فيه. تكمل؟")) return;
    setCategoriesList((current) => current.filter((c) => c.id !== catId));
    try {
      await fetch("/api/admin/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: catId })
      });
    } catch {}
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

            {/* Stock management */}
            <div className="stock-control">
              <h3><Package size={16} /> إدارة المخزون</h3>
              <div className="stock-mode-switch">
                <button
                  type="button"
                  className={productForm.stockMode === "unlimited" ? "active" : ""}
                  onClick={() => setProductForm({ ...productForm, stockMode: "unlimited", stock: "" })}
                >
                  كمية غير محدودة
                </button>
                <button
                  type="button"
                  className={productForm.stockMode === "limited" ? "active" : ""}
                  onClick={() => setProductForm({ ...productForm, stockMode: "limited", stock: productForm.stock || "0" })}
                >
                  كمية محدودة
                </button>
              </div>
              {productForm.stockMode === "limited" && (
                <label>
                  عدد القطع المتاحة
                  <input
                    type="number"
                    min="0"
                    value={productForm.stock}
                    onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })}
                    placeholder="مثال: 10"
                  />
                </label>
              )}
            </div>

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
            {(productForm.image || (productForm.id && !productForm.removeImage)) && (
              <div className="image-preview-wrap">
                <img
                  className="admin-preview"
                  src={productForm.image?.startsWith("data:")
                    ? productForm.image
                    : `/api/product-image/${productForm.id}?v=${encodeURIComponent(productForm.updatedAt || productForm.image || "")}`}
                  alt="معاينة المنتج"
                />
                <button type="button" className="remove-image-btn" onClick={() => setProductForm({ ...productForm, image: "", removeImage: true })}>
                  <Trash2 size={14} />
                  إزالة الصورة
                </button>
              </div>
            )}
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

          {/* Category management */}
          <div className="category-manager">
            <h2><FolderPlus size={20} /> إدارة الأقسام</h2>
            <form className="category-add-form" onSubmit={addCategory}>
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="اسم القسم الجديد"
                required
              />
              <input
                type="number"
                value={newCategorySortOrder}
                onChange={(event) => setNewCategorySortOrder(event.target.value)}
                placeholder="ترتيب (رقم)"
                min="0"
                style={{ width: "100px" }}
              />
              <button className="primary-action" disabled={savingCategory}>
                {savingCategory ? "جاري..." : "إضافة"}
              </button>
            </form>
            {categoryMessage && <p className="category-msg">{categoryMessage}</p>}
            <div className="category-list">
              {categoriesList.map((cat) => (
                <div className="category-item" key={cat.id}>
                  <span className="category-name">{cat.name}</span>
                  <span className="category-order">ترتيب: {cat.sortOrder}</span>
                  <div className="category-actions">
                    <button
                      type="button"
                      title="رفع للأعلى"
                      onClick={() => updateCategorySortOrder(cat.id, Math.max(0, cat.sortOrder - 1))}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      title="نزّل للأسفل"
                      onClick={() => updateCategorySortOrder(cat.id, cat.sortOrder + 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      title="حذف القسم"
                      onClick={() => removeCategory(cat.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {categoriesList.length === 0 && <p className="admin-empty">لا توجد أقسام مسجلة.</p>}
            </div>
          </div>

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
            <button type="button" onClick={migrateLegacyImages} disabled={migratingImages || dashboardLoading}>
              {migratingImages ? "\u062c\u0627\u0631\u064a \u062a\u062e\u0641\u064a\u0641 \u0627\u0644\u0635\u0648\u0631..." : "\u062a\u062e\u0641\u064a\u0641 \u0627\u0644\u0635\u0648\u0631"}
            </button>
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder="ابحث باسم المنتج أو القسم"
            />
          </div>
          {productActionError && <p className="admin-action-error">{productActionError}</p>}
          {dedupeMessage && <p className="admin-action-success">{dedupeMessage}</p>}
          {imageMigrationMessage && <p className="admin-action-success">{imageMigrationMessage}</p>}
          <div className="admin-list">
            {dashboardLoading && (
              <p className="admin-empty">جاري تحميل المنتجات...</p>
            )}
            {!dashboardLoading && dashboardError && (
              <p className="admin-empty">{dashboardError}</p>
            )}
            {!dashboardLoading && !dashboardError && displayedAdminProducts.map((product) => (
              <article key={product.id} className={!product.available ? "muted" : ""}>
                <AdminProductThumb product={product} />
                <div>
                  <strong>{product.name}</strong>
                  <span>
                    {product.category} - {money(product.price)}
                    {Boolean(product.offerActive) && Number(product.originalPrice) > Number(product.price)
                      ? ` بدل ${money(product.originalPrice)}`
                      : ""}
                    {product.stockMode === "limited" ? ` | مخزون: ${product.stock}` : ""}
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
