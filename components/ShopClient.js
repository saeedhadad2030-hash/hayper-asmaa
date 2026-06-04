"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  BadgePercent,
  Clock3,
  Info,
  MapPin,
  MessageCircle,
  Minus,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Share2,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Trash2
} from "lucide-react";
import { calculateDeposit, getDeliveryDate, money, PAYMENT } from "@/lib/shop";
import AdminAccess from "@/components/AdminAccess";

const tabs = [
  { id: "about", label: "عن الماركت", icon: Info },
  { id: "sweets", label: "قسم الحلويات", icon: Sparkles },
  { id: "offers", label: "عروض وخصومات", icon: BadgePercent },
  { id: "facebook", label: "تابعنا ع الفيس", icon: Share2 }
];

const PRODUCT_BATCH_SIZE = 48;
const EMPTY_PRODUCTS = [];
const PRODUCTS_CACHE_KEY = "hyperProductsCache:v4";

// Sort categories: تورت always last
const CATEGORY_SORT_KEY = "تورت";
function sortCategories(categories) {
  return [...categories].sort((a, b) => {
    if (a === CATEGORY_SORT_KEY) return 1;
    if (b === CATEGORY_SORT_KEY) return -1;
    return 0;
  });
}

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

function Logo() {
  return (
    <div className="brand-mark" aria-label="هايبر أسماء">
      <img src="/hyper-asmaa-logo.svg" alt="لوجو هايبر أسماء" />
      <span>
        هايبر
        <strong>أسماء</strong>
      </span>
    </div>
  );
}

// IntersectionObserver-based lazy image loader
function LazyProductImage({ product }) {
  const containerRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [useProxy, setUseProxy] = useState(false);

  const image = String(product.image || "").trim();
  const imageVersion = encodeURIComponent(product.updatedAt || image.slice(-36));
  const proxySrc = `/api/product-image/${product.id}?v=${imageVersion}`;
  const imageSrc = image
    ? image.startsWith("data:image/") || !useProxy
      ? image
      : proxySrc
    : proxySrc;

  useEffect(() => {
    setFailed(false);
    setUseProxy(false);
    setLoaded(false);
  }, [image, product.updatedAt]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px 0px", threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (failed) {
    return (
      <div ref={containerRef} className="placeholder-dessert" aria-hidden="true">
        <span />
        <b>{product.category.includes("مخبوزات") ? "مخبوزات" : "حلويات"}</b>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`lazy-image-wrap ${loaded ? "loaded" : ""}`}>
      {isVisible && (
        <img
          src={imageSrc}
          alt={product.name}
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => {
            if (image && !image.startsWith("data:image/") && !useProxy) {
              setUseProxy(true);
              return;
            }
            setFailed(true);
          }}
        />
      )}
      {!loaded && !failed && <div className="img-placeholder-shimmer" />}
    </div>
  );
}

export default function ShopClient({ initialProducts = EMPTY_PRODUCTS, initialProductsError = "" }) {
  const [products, setProducts] = useState(initialProducts);
  const [productsLoading, setProductsLoading] = useState(initialProducts.length === 0 && !initialProductsError);
  const [productsError, setProductsError] = useState(initialProductsError);
  const [visibleLimit, setVisibleLimit] = useState(PRODUCT_BATCH_SIZE);
  const [cart, setCart] = useState([]);
  const [activeTab, setActiveTab] = useState("sweets");
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminRevealCount, setAdminRevealCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [cartBump, setCartBump] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    address: "",
    notes: "",
    paymentMethod: "instapay"
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    const hasInitialProducts = initialProducts.length > 0;
    let hasFallbackProducts = hasInitialProducts;
    if (hasInitialProducts) {
      try {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(initialProducts));
      } catch {}
    } else {
      try {
        localStorage.removeItem("hyperProductsCache");
        const cachedProducts = JSON.parse(localStorage.getItem(PRODUCTS_CACHE_KEY) || "[]");
        if (Array.isArray(cachedProducts) && cachedProducts.length > 0) {
          hasFallbackProducts = true;
          setProducts(cachedProducts);
          setProductsLoading(false);
          setProductsError("");
        }
      } catch {
        localStorage.removeItem(PRODUCTS_CACHE_KEY);
      }
    }
    if (!hasInitialProducts) {
      setProductsLoading(true);
      setProductsError("");
    }
    fetch("/api/products", { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("Products request failed");
        return res.json();
      })
      .then((data) => {
        if (!active) return;
        const nextProducts = data.products || [];
        setProducts((current) => {
          const mergedProducts = mergeProductImages(current, nextProducts);
          try {
            localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(mergedProducts));
          } catch {}
          return mergedProducts;
        });
      })
      .catch(() => {
        if (!active) return;
        setProductsError((current) => (hasFallbackProducts ? current : "تعذر تحميل المنتجات. جرب تحديث الصفحة."));
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setProductsLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    setVisibleLimit(PRODUCT_BATCH_SIZE);
  }, [activeTab, query]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("hyperCheckout") || "{}");
      if (Array.isArray(saved.cart)) setCart(saved.cart);
      if (saved.form) setForm((current) => ({ ...current, ...saved.form }));
    } catch {
      localStorage.removeItem("hyperCheckout");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "hyperCheckout",
      JSON.stringify({
        cart,
        form,
      })
    );
  }, [cart, form]);

  const categories = useMemo(() => {
    const raw = Array.from(new Set(products.map((product) => product.category)));
    return sortCategories(raw);
  }, [products]);

  // Build a category order map for sorting products
  const categoryOrder = useMemo(() => {
    const order = new Map();
    categories.forEach((cat, index) => order.set(cat, index));
    return order;
  }, [categories]);

  const visibleProducts = useMemo(() => {
    const search = query.trim();
    const filtered = products.filter((product) => {
      const matchesTab =
        activeTab === "offers"
          ? Boolean(product.offerActive) && Number(product.originalPrice) > Number(product.price)
          : activeTab === "sweets"
          ? true
          : categories.includes(activeTab)
            ? product.category === activeTab
            : true;
      const matchesSearch = search ? product.name.includes(search) : true;
      return matchesTab && matchesSearch;
    });
    // Sort products: تورت always last
    return filtered.sort((a, b) => {
      const orderA = categoryOrder.get(a.category) ?? 50;
      const orderB = categoryOrder.get(b.category) ?? 50;
      if (orderA !== orderB) return orderA - orderB;
      return 0;
    });
  }, [products, query, activeTab, categories, categoryOrder]);

  const offerProducts = useMemo(
    () => products.filter((product) => Boolean(product.offerActive) && Number(product.originalPrice) > Number(product.price)),
    [products]
  );
  const displayedProducts = visibleProducts.slice(0, visibleLimit);

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deposit = calculateDeposit(subtotal, form.paymentMethod);
  const payment = PAYMENT[form.paymentMethod];
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  function jumpTo(tabId) {
    setActiveTab(tabId);
    const targetId = tabId === "facebook" ? "social" : tabId;
    window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function revealAdmin() {
    const next = adminRevealCount + 1;
    setAdminRevealCount(next);
    if (next >= 5) {
      setAdminOpen(true);
      setAdminRevealCount(0);
    }
  }

  function addToCart(product, customPrice) {
    // Check stock before adding
    if (product.stock !== null && product.stock !== undefined) {
      const currentInCart = cart
        .filter((item) => item.id === product.id)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (currentInCart >= Number(product.stock)) {
        setToast({ id: Date.now(), productName: `${product.name} - الكمية المتاحة خلصت!`, isError: true });
        window.setTimeout(() => setToast(null), 2300);
        return;
      }
    }

    const price = Number(customPrice || product.price);
    setCart((current) => {
      const found = current.find((item) => item.id === product.id && item.price === price);
      if (found) {
        return current.map((item) =>
          item === found ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...current,
        {
          id: product.id,
          name: product.name,
          price,
          basePrice: product.price,
          variablePrice: Boolean(product.variablePrice),
          quantity: 1
        }
      ];
    });
    setToast({ id: Date.now(), productName: product.name });
    setCartBump(true);
    window.setTimeout(() => setCartBump(false), 520);
    window.setTimeout(() => setToast(null), 2300);
  }

  function updateQty(index, delta) {
    setCart((current) =>
      current
        .map((item, itemIndex) =>
          itemIndex === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  async function submitOrder(event) {
    event.preventDefault();
    setMessage("");
    setSending(true);
    const payload = {
      ...form,
      items: cart.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        customPrice: item.variablePrice ? item.price : undefined
      }))
    };

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    setSending(false);

    if (!response.ok) {
      setMessage(data.error || "حصل خطأ أثناء إرسال الطلب");
      return;
    }

    const orderItemsText = cart
      .map((item) => `- ${item.name} × ${item.quantity} = ${money(item.price * item.quantity)}`)
      .join("\n");
    const whatsappMessage = [
      "طلب حجز جديد - هايبر أسماء",
      "-------------------------",
      `رقم الطلب: ${data.order.id}`,
      `حالة الطلب: ${data.order.status}`,
      `الاسم: ${form.customerName}`,
      `الهاتف: ${form.phone}`,
      `العنوان: ${form.address}`,
      "",
      "المنتجات:",
      orderItemsText,
      "",
      `الإجمالي: ${money(data.order.subtotal)}`,
      `العربون المطلوب: ${money(data.order.deposit)}`,
      `عمولة التحويل: ${money(data.order.fee)}`,
      `المطلوب تحويله الآن: ${money(data.order.depositTotal)}`,
      `طريقة الدفع: ${payment.label}`,
      `رقم التحويل: ${data.order.paymentNumber}`,
      `التوصيل المتوقع: ${data.order.deliveryDate}`,
      form.notes ? `ملاحظات: ${form.notes}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/201550181908?text=${encodeURIComponent(whatsappMessage)}`, "_blank", "noopener,noreferrer");
    setMessage(`تم تسجيل الطلب رقم ${data.order.id}. الإدارة هتراجعه وتأكد الحجز.`);
    setCart([]);
    setForm({
      customerName: "",
      phone: "",
      address: "",
      notes: "",
      paymentMethod: "instapay"
    });
    localStorage.removeItem("hyperCheckout");
  }

  return (
    <main className="shop-shell">
      <header className="topbar">
        <a className="whatsapp-link" href="https://wa.me/201031367037" target="_blank" aria-label="واتساب">
          <MessageCircle size={23} />
        </a>
        <button className="brand-button" onClick={revealAdmin} aria-label="هايبر أسماء">
          <Logo />
        </button>
        <button className={`cart-mini ${cartBump ? "bump" : ""}`} onClick={() => setCartOpen(true)} aria-label="فتح السلة">
          <ShoppingCart size={22} />
          <span>{cartCount}</span>
        </button>
      </header>

      <nav className="tabbar" aria-label="أقسام الموقع">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              className={activeTab === tab.id ? "active" : ""}
              onClick={() => jumpTo(tab.id)}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section className="intro-band scroll-target" id="about">
        <div>
          <p className="eyebrow">حجز مسبق فقط</p>
          <h1>هايبر أسماء</h1>
          <p>
            اطلب حلويات ومخبوزات للحجز المسبق. التحويل بنصف قيمة الطلب يؤكد الحجز بعد مراجعة
            الإدارة.
          </p>
        </div>
        <div className="hero-logo">
          <img src="/hyper-asmaa-logo.svg" alt="لوجو هايبر أسماء" />
        </div>
        <div className="quick-info">
          <span>التوصيل المتوقع</span>
          <strong>{getDeliveryDate()}</strong>
          <small>بعد 9 مساء يتم ترحيل التوصيل يوم إضافي.</small>
        </div>
      </section>

      <section className="market-info" aria-label="عن الماركت">
        <div className="market-card main">
          <MapPin size={22} />
          <div>
            <span>العنوان</span>
            <strong>كفر الغاب الشارع المقابل لمكتبه بينك بجوار مجمع الاستقامه</strong>
          </div>
        </div>
        <a className="market-card" href="tel:01031367037">
          <Phone size={21} />
          <div>
            <span>للطلب والاستفسار</span>
            <strong>01031367037</strong>
          </div>
        </a>
        <div className="market-card">
          <Clock3 size={21} />
          <div>
            <span>نظام الحجز</span>
            <strong>قبل 9 مساء تاني يوم، بعد 9 مساء بعد يومين</strong>
          </div>
        </div>
        <div className="market-card">
          <ShieldCheck size={21} />
          <div>
            <span>تأكيد الطلب</span>
            <strong>بنصف المبلغ أو تأكيد الإدارة</strong>
          </div>
        </div>
      </section>

      <section className="catalog-tools scroll-target" id="sweets">
        <div className="searchbox">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="دور على منتج"
          />
        </div>
        <div className="category-row">
          <button className={activeTab === "sweets" ? "active" : ""} onClick={() => setActiveTab("sweets")}>
            الكل
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={activeTab === category ? "active" : ""}
              onClick={() => setActiveTab(category)}
            >
              {category}
            </button>
          ))}
        </div>
        <div className="catalog-meta">
          <span>{visibleProducts.length} منتج متاح للعرض</span>
          <strong>{offerProducts.length} عرض شغال</strong>
        </div>
      </section>

      <section className="products-grid">
        {productsLoading &&
          Array.from({ length: 8 }).map((_, index) => <div className="product-skeleton" key={index} />)}
        {!productsLoading && productsError && <p className="empty catalog-empty">{productsError}</p>}
        {!productsLoading && !productsError && displayedProducts.map((product) => (
          <ProductCard key={product.id} product={product} onAdd={addToCart} cart={cart} />
        ))}
        {!productsLoading && !productsError && visibleProducts.length === 0 && (
          <p className="empty catalog-empty">مفيش منتجات مطابقة للبحث.</p>
        )}
      </section>
      {!productsLoading && !productsError && visibleLimit < visibleProducts.length && (
        <div className="load-more-wrap">
          <button type="button" onClick={() => setVisibleLimit((limit) => limit + PRODUCT_BATCH_SIZE)}>
            عرض منتجات أكتر
          </button>
        </div>
      )}

      <section className="about-market scroll-target" id="offers">
        <div>
          <BadgePercent />
          <h2>عروض وخصومات</h2>
          <p>
            {offerProducts.length
              ? `عندنا ${offerProducts.length} عرض متاح دلوقتي. اضغط على تبويب العروض لعرضهم فقط.`
              : "تابع العروض من هنا، وكل المنتجات المتاحة للحجز بتظهر في الكتالوج مباشرة."}
          </p>
        </div>
        <a id="social" href="https://www.facebook.com/profile.php?id=100083242605659" target="_blank">
          <Share2 />
          تابعنا على فيس بوك
        </a>
      </section>

      <footer>
        تم إنشاءه بواسطة{" "}
        <a href="https://www.instagram.com/saeed_hadad1" target="_blank">
          saeed_hadad1
        </a>
      </footer>

      <button className={`floating-cart ${cartBump ? "bump" : ""}`} onClick={() => setCartOpen(true)} aria-label="فتح السلة">
        <ShoppingCart />
        <span>{cartCount}</span>
      </button>

      {toast && (
        <div className={`add-toast ${toast.isError ? "toast-error" : ""}`} role="status" aria-live="polite">
          <div>
            <strong>{toast.isError ? "تنبيه" : "تمت الإضافة للسلة"}</strong>
            <span>{toast.productName}</span>
          </div>
          {!toast.isError && <button onClick={() => setCartOpen(true)}>إكمال الطلب</button>}
        </div>
      )}

      {cartOpen && (
        <aside className="cart-drawer" aria-label="السلة والحجز">
          <div className="drawer-panel">
            <div className="drawer-head">
              <h2>سلة الحجز</h2>
              <button onClick={() => setCartOpen(false)}>إغلاق</button>
            </div>

            {cart.length === 0 ? (
              <p className="empty">السلة فاضية. اختار منتجاتك الأول.</p>
            ) : (
              <div className="cart-items">
                {cart.map((item, index) => (
                  <div className="cart-line" key={`${item.id}-${item.price}`}>
                    <div>
                      <strong>{item.name}</strong>
                      <span>{money(item.price)} × {item.quantity}</span>
                    </div>
                    <div className="qty">
                      <button onClick={() => updateQty(index, 1)}><Plus size={14} /></button>
                      <button onClick={() => updateQty(index, -1)}><Minus size={14} /></button>
                      <button onClick={() => updateQty(index, -item.quantity)}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="totals">
              <span>إجمالي المنتجات</span>
              <strong>{money(subtotal)}</strong>
              <span>العربون المطلوب</span>
              <strong>{money(deposit.depositBase)}</strong>
              <span>عمولة التحويل</span>
              <strong>{money(deposit.fee)}</strong>
              <span>الإجمالي المطلوب تحويله الآن</span>
              <strong>{money(deposit.depositTotal)}</strong>
            </div>

            <form className="checkout-form" onSubmit={submitOrder}>
              <label>
                الاسم
                <input value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
              </label>
              <label>
                رقم الهاتف
                <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required />
              </label>
              <label>
                العنوان
                <textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} required />
              </label>
              <label>
                ملاحظات
                <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </label>

              <div className="payment-switch">
                {Object.entries(PAYMENT).map(([key, option]) => (
                  <button
                    key={key}
                    type="button"
                    className={form.paymentMethod === key ? "active" : ""}
                    onClick={() => setForm({ ...form, paymentMethod: key })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="payment-card">
                <ReceiptText size={20} />
                <div>
                  <span>حوّل على رقم {payment.label}</span>
                  <strong>{payment.number}</strong>
                </div>
              </div>

              {message && <p className="form-message">{message}</p>}
              <button className="primary-action" disabled={sending || cart.length === 0}>
                {sending ? "جاري تسجيل الطلب..." : "تأكيد الحجز"}
              </button>
            </form>
          </div>
        </aside>
      )}

      {adminOpen && (
        <aside className="admin-modal" aria-label="لوحة الإدارة">
          <AdminAccess embedded onClose={() => setAdminOpen(false)} />
        </aside>
      )}
    </main>
  );
}

function ProductCard({ product, onAdd, cart }) {
  const [customPrice, setCustomPrice] = useState(product.price);
  const soldOut = !product.available;
  const hasLimitedStock = product.stock !== null && product.stock !== undefined;
  const stockLeft = hasLimitedStock ? Number(product.stock) : null;
  const cartQty = cart
    .filter((item) => item.id === product.id)
    .reduce((sum, item) => sum + item.quantity, 0);
  const stockExhausted = hasLimitedStock && stockLeft <= 0;
  const isDisabled = soldOut || stockExhausted;

  return (
    <article className="product-card">
      <div className="image-wrap">
        <LazyProductImage product={product} />
        {Boolean(product.offerActive) && Number(product.originalPrice) > Number(product.price) && (
          <span className="offer-ribbon">عرض</span>
        )}
        {hasLimitedStock && !soldOut && (
          <span className={`stock-badge ${stockLeft <= 3 ? "stock-low" : ""}`}>
            {stockLeft <= 0 ? "نفذ" : `متبقي ${stockLeft}`}
          </span>
        )}
        {soldOut && <div className="soldout">Sold<br />Out</div>}
      </div>
      <h3>{product.name}</h3>
      <p>{product.category}</p>
      <div className="price-stack">
        {Boolean(product.offerActive) && Number(product.originalPrice) > Number(product.price) && (
          <span className="old-price">بدل {money(product.originalPrice)}</span>
        )}
        <strong className="price">{money(product.price)}</strong>
      </div>
      {Boolean(product.variablePrice) && (
        <label className="custom-price">
          حدد مبلغك
          <input
            type="number"
            min="1"
            value={customPrice}
            onChange={(event) => setCustomPrice(event.target.value)}
          />
        </label>
      )}
      <button disabled={isDisabled} onClick={() => onAdd(product, customPrice)}>
        {soldOut ? "Sold Out ×" : stockExhausted ? "نفذ المخزون" : "إضافة للسلة"}
      </button>
    </article>
  );
}
