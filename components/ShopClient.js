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
  Trash2,
  Zap,
  Heart,
  ClipboardList
} from "lucide-react";
import { calculateDeposit, getDeliveryDate, money, PAYMENT } from "@/lib/shop";
import AdminAccess from "@/components/AdminAccess";

const tabs = [
  { id: "about", label: "عن الماركت", icon: Info },
  { id: "sweets", label: "قسم الحلويات", icon: Sparkles },
  { id: "offers", label: "عروض وخصومات", icon: BadgePercent },
  { id: "wishlist", label: "المفضلة ❤️", icon: Heart },
  { id: "facebook", label: "تابعنا ع الفيس", icon: Share2 }
];

const PRODUCT_BATCH_SIZE = 48;
const EMPTY_PRODUCTS = [];
const PRODUCTS_CACHE_KEY = "hyperProductsCache:v4";

// Sort categories using sortOrder from DB, fallback: تورت always last
function sortCategories(categoryNames, categoryOrderMap) {
  return [...categoryNames].sort((a, b) => {
    const orderA = categoryOrderMap.get(a) ?? 50;
    const orderB = categoryOrderMap.get(b) ?? 50;
    if (orderA !== orderB) return orderA - orderB;
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

const CATEGORY_ICONS = {
  "حلويات شريف الزيني": "🍮",
  "مخبوزات": "🥐",
  "مشكل حلويات": "🍬",
  "تورت": "🎂"
};

function getCategoryIcon(name) {
  return CATEGORY_ICONS[name] || "✨";
}

function createSweetsExplosion(event) {
  if (!event || !event.clientX || !event.clientY) return;
  const emojis = ["🧁", "🍰", "🥐", "🍩", "🍪", "✨"];
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = `${event.clientX}px`;
  container.style.top = `${event.clientY}px`;
  container.style.pointerEvents = "none";
  container.style.zIndex = "9999";
  document.body.appendChild(container);

  for (let i = 0; i < 6; i++) {
    const particle = document.createElement("span");
    particle.innerText = emojis[Math.floor(Math.random() * emojis.length)];
    particle.style.position = "absolute";
    particle.style.fontSize = "22px";
    particle.style.userSelect = "none";
    particle.style.transition = "transform 800ms cubic-bezier(0.1, 0.8, 0.3, 1), opacity 800ms ease-out";
    particle.style.transform = "translate(-50%, -50%) scale(0.5)";
    particle.style.opacity = "1";
    
    const angle = (Math.random() * Math.PI * 1.5) - Math.PI * 0.75;
    const velocity = 40 + Math.random() * 60;
    const tx = Math.cos(angle) * velocity;
    const ty = Math.sin(angle) * velocity - 60;
    
    container.appendChild(particle);
    
    window.requestAnimationFrame(() => {
      particle.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(1.3) rotate(${Math.random() * 360}deg)`;
      particle.style.opacity = "0";
    });
  }

  window.setTimeout(() => {
    container.remove();
  }, 1000);
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

export default function ShopClient({ initialProducts = EMPTY_PRODUCTS, initialProductsError = "", initialCategories = [] }) {
  const [products, setProducts] = useState(initialProducts);

  // Build category sort order map from DB categories
  const categorySortMap = useMemo(() => {
    const map = new Map();
    if (initialCategories.length > 0) {
      initialCategories.forEach(cat => map.set(cat.name, cat.sortOrder ?? 50));
    }
    // Fallback if no categories from DB
    if (map.size === 0) {
      map.set("حلويات شريف الزيني", 1);
      map.set("مخبوزات", 2);
      map.set("مشكل حلويات", 3);
      map.set("تورت", 99);
    }
    return map;
  }, [initialCategories]);
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
  const [wishlist, setWishlist] = useState([]);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trackerPhone, setTrackerPhone] = useState("");
  const [trackedOrders, setTrackedOrders] = useState([]);
  const [trackerSearching, setTrackerSearching] = useState(false);
  const [trackerError, setTrackerError] = useState("");
  const [lastOrder, setLastOrder] = useState(null);
  const [promoIndex, setPromoIndex] = useState(0);

  const promoSlides = [
    {
      title: "🧁 عرض الأسبوع الخاص!",
      desc: "احجز تورتة السيزون اليوم واحصل على خصم 20% فوري لتسليم الغد 🎂",
      color: "linear-gradient(135deg, #10b981, #047857)"
    },
    {
      title: "🥐 مخبوزات طازجة يومياً",
      desc: "كرواسون وباتيه بالزبدة الطبيعية جاهز للحجز والاستلام الفوري 🥖",
      color: "linear-gradient(135deg, #f59e0b, #d97706)"
    },
    {
      title: "🍬 مشكل حلويات شريف الزيني",
      desc: "أقوى تشكيلة بسبوسة وكنافة بالسمن البلدي الفاخر لحفلاتكم السعيدة 🍮",
      color: "linear-gradient(135deg, #ec4899, #be185d)"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setPromoIndex((prev) => (prev + 1) % promoSlides.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [promoSlides.length]);

  useEffect(() => {
    const saved = localStorage.getItem("wishlist");
    if (saved) {
      try {
        setWishlist(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  function toggleWishlist(productId) {
    setWishlist((current) => {
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId];
      localStorage.setItem("wishlist", JSON.stringify(next));
      return next;
    });
  }

  async function searchTrackedOrders() {
    const clean = trackerPhone.trim();
    if (!clean) {
      setTrackerError("برجاء كتابة رقم الهاتف");
      return;
    }
    setTrackerSearching(true);
    setTrackerError("");
    setTrackedOrders([]);
    try {
      const res = await fetch(`/api/orders?phone=${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok) {
        setTrackerError(data.error || "خطأ أثناء البحث");
      } else {
        setTrackedOrders(data.orders || []);
        if ((data.orders || []).length === 0) {
          setTrackerError("لم يتم العثور على أي طلبات بهذا الرقم");
        }
      }
    } catch (err) {
      setTrackerError("فشل الاتصال بالخادم");
    } finally {
      setTrackerSearching(false);
    }
  }

  function downloadReceiptAsImage(order) {
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 850;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, "#10b981");
    grad.addColorStop(1, "#047857");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, 110);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("هايبر أسماء - إيصال حجز الكتروني", canvas.width / 2, 65);

    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "right";
    ctx.font = "18px Arial, sans-serif";

    let y = 180;
    ctx.fillText(`رقم الحجز: HA-${order.id}`, 550, y); y += 40;
    ctx.fillText(`اسم العميل: ${order.customerName}`, 550, y); y += 40;
    ctx.fillText(`الهاتف: ${order.phone}`, 550, y); y += 40;
    ctx.fillText(`موعد التوصيل المتوقع: ${order.deliveryDate}`, 550, y); y += 40;
    ctx.fillText(`نوع التوصيل: ${order.deliveryOption === "today" ? "توصيل اليوم" : "حجز مسبق"}`, 550, y); y += 45;

    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(550, y);
    ctx.stroke();
    ctx.setLineDash([]);
    y += 45;

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 19px Arial, sans-serif";
    ctx.fillText("تفاصيل المنتجات المحجوزة:", 550, y); y += 35;

    ctx.font = "16px Arial, sans-serif";
    order.items.forEach((item) => {
      ctx.textAlign = "right";
      ctx.fillText(`• ${item.name} (عدد ${item.quantity})`, 550, y);
      ctx.textAlign = "left";
      ctx.fillText(`${money(item.price * item.quantity)}`, 50, y);
      y += 35;
    });

    y += 15;
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(50, y);
    ctx.lineTo(550, y);
    ctx.stroke();
    y += 45;

    ctx.fillStyle = "#0f172a";
    ctx.textAlign = "right";
    ctx.font = "bold 18px Arial, sans-serif";
    ctx.fillText("الإجمالي الفرعي:", 550, y);
    ctx.textAlign = "left";
    ctx.fillText(`${money(order.subtotal)}`, 50, y);
    
    y += 35;
    ctx.textAlign = "right";
    ctx.fillStyle = "#047857";
    ctx.fillText(`العربون المطلوب (الآن):`, 550, y);
    ctx.textAlign = "left";
    ctx.fillText(`${money(order.deposit)}`, 50, y);

    y += 35;
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.fillText(`عمولة التحويل:`, 550, y);
    ctx.textAlign = "left";
    ctx.fillText(`${money(order.fee)}`, 50, y);

    y += 45;
    ctx.fillStyle = "#b91c1c";
    ctx.font = "bold 20px Arial, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`الإجمالي المطلوب تحويله لتأكيد الحجز:`, 550, y);
    ctx.textAlign = "left";
    ctx.fillText(`${money(order.depositTotal)}`, 50, y);

    y += 55;
    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    const barcodeStart = 160;
    for (let i = 0; i < 35; i++) {
      const w = (i % 4 === 0) ? 5 : (i % 2 === 0) ? 2 : 1;
      ctx.fillRect(barcodeStart + i * 8, y, w, 50);
    }
    y += 75;
    ctx.fillStyle = "#64748b";
    ctx.font = "14px Arial, sans-serif";
    ctx.fillText(`شكراً لثقتكم بنا - هايبر أسماء للحجز المسبق`, canvas.width / 2, y);

    const link = document.createElement("a");
    link.download = `HyperAsmaa-Voucher-${order.id}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  const [cartBump, setCartBump] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    address: "",
    notes: "",
    paymentMethod: "instapay",
    deliveryOption: "tomorrow"
  });

  // Check if any product in the cart forces a pre-order (stock <= 0 or quantity > stock)
  const cartForcesPreOrder = useMemo(() => {
    return cart.some((item) => {
      const product = products.find((p) => p.id === item.id);
      if (product && product.stock !== null && product.stock !== undefined) {
        return Number(product.stock) <= 0 || item.quantity > Number(product.stock);
      }
      return false;
    });
  }, [cart, products]);

  // Automatically adjust delivery option if cart forces pre-order
  useEffect(() => {
    if (cartForcesPreOrder && form.deliveryOption === "today") {
      setForm((current) => ({ ...current, deliveryOption: "tomorrow" }));
    }
  }, [cartForcesPreOrder, form.deliveryOption]);

  const displayedDeliveryDate = useMemo(() => {
    const offset = form.deliveryOption === "today" ? 0 : null;
    return getDeliveryDate(new Date(), offset);
  }, [form.deliveryOption]);

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
      if (saved.form) setForm((current) => ({ ...current, ...saved.form, deliveryOption: saved.form.deliveryOption || "tomorrow" }));
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
    return sortCategories(raw, categorySortMap);
  }, [products, categorySortMap]);

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
          : activeTab === "wishlist"
            ? wishlist.includes(product.id)
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
    if (tabId === "facebook") {
      window.open("https://www.facebook.com/profile.php?id=100083242605659", "_blank", "noopener,noreferrer");
      return;
    }
    setActiveTab(tabId);
    const targetId = tabId === "offers" ? "sweets" : tabId;
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

  function addToCart(product, customPrice, forceOpenCart = false, defaultDeliveryOption = null, event = null) {
    if (event) {
      createSweetsExplosion(event);
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

    if (defaultDeliveryOption) {
      setForm((current) => ({ ...current, deliveryOption: defaultDeliveryOption }));
    }

    setToast({ id: Date.now(), productName: product.name });
    setCartBump(true);
    window.setTimeout(() => setCartBump(false), 520);
    window.setTimeout(() => setToast(null), 2300);

    if (forceOpenCart) {
      setCartOpen(true);
    }
  }

  function updateQty(index, delta, event = null) {
    if (event && delta > 0) {
      createSweetsExplosion(event);
    }
    setCart((current) =>
      current
        .map((item, itemIndex) =>
          itemIndex === index ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function updateCartQty(productId, delta, event = null) {
    if (event && delta > 0) {
      createSweetsExplosion(event);
    }
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    setCart((current) => {
      const found = current.find((item) => item.id === productId);
      if (!found) {
        if (delta <= 0) return current;
        if (product.stock !== null && product.stock !== undefined && Number(product.stock) <= 0) {
          setForm((c) => ({ ...c, deliveryOption: "tomorrow" }));
        }
        return [
          ...current,
          {
            id: product.id,
            name: product.name,
            price: Number(product.price),
            basePrice: product.price,
            variablePrice: Boolean(product.variablePrice),
            quantity: 1
          }
        ];
      }

      const newQty = found.quantity + delta;
      if (newQty <= 0) {
        return current.filter((item) => item.id !== productId);
      }

      if (form.deliveryOption === "today" && product.stock !== null && product.stock !== undefined) {
        if (newQty > Number(product.stock)) {
          setToast({ id: Date.now(), productName: `${product.name} - الكمية المتاحة للتوصيل اليوم خلصت!`, isError: true });
          window.setTimeout(() => setToast(null), 2300);
          return current;
        }
      }

      return current.map((item) =>
        item.id === productId ? { ...item, quantity: newQty } : item
      );
    });

    setCartBump(true);
    window.setTimeout(() => setCartBump(false), 520);
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
      `نوع الطلب: ${form.deliveryOption === "today" ? "توصيل فوري (اليوم)" : "حجز مسبق (لتاني يوم)"}`,
      `طريقة الدفع: ${payment.label}`,
      `رقم التحويل: ${data.order.paymentNumber}`,
      `التوصيل المتوقع: ${data.order.deliveryDate}`,
      form.notes ? `ملاحظات: ${form.notes}` : ""
    ]
      .filter(Boolean)
      .join("\n");
    window.open(`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_ORDER_NUMBER || "201550181908"}?text=${encodeURIComponent(whatsappMessage)}`, "_blank", "noopener,noreferrer");
    setLastOrder({
      id: data.order.id,
      customerName: form.customerName,
      phone: form.phone,
      address: form.address,
      deliveryOption: form.deliveryOption,
      paymentLabel: payment.label,
      paymentNumber: data.order.paymentNumber || payment.number,
      deliveryDate: data.order.deliveryDate,
      subtotal: data.order.subtotal,
      deposit: data.order.deposit,
      fee: data.order.fee,
      depositTotal: data.order.depositTotal,
      notes: form.notes,
      items: [...cart]
    });
    setCart([]);
    setCartOpen(false);
    setForm({
      customerName: "",
      phone: "",
      address: "",
      notes: "",
      paymentMethod: "instapay",
      deliveryOption: "tomorrow"
    });
    localStorage.removeItem("hyperCheckout");
  }

  return (
    <main className="shop-shell">
      <header className="topbar">
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <a className="whatsapp-link" href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER || "201031367037"}`} target="_blank" aria-label="واتساب">
            <MessageCircle size={23} />
          </a>
          <button onClick={() => setTrackerOpen(true)} className="header-track-btn" aria-label="تتبع طلباتي">
            <ClipboardList size={22} />
          </button>
        </div>
        <button className="brand-button" onClick={revealAdmin} aria-label="هايبر أسماء">
          <Logo />
        </button>
        <button className={`cart-mini ${cartBump ? "bump" : ""}`} onClick={() => setCartOpen(true)} aria-label="فتح السلة">
          <ShoppingCart size={22} />
          <span>{cartCount}</span>
        </button>
      </header>

      {/* Promo Banner Carousel */}
      <div className="promo-carousel">
        {promoSlides.map((slide, idx) => (
          <div
            key={idx}
            className={`promo-slide ${promoIndex === idx ? "active" : ""}`}
            style={{ background: slide.color }}
          >
            <div className="promo-slide-content">
              <h3>{slide.title}</h3>
              <p>{slide.desc}</p>
            </div>
            <div className="promo-indicator-dots">
              {promoSlides.map((_, i) => (
                <span
                  key={i}
                  className={`dot ${promoIndex === i ? "active" : ""}`}
                  onClick={() => setPromoIndex(i)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

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
        {/* Instagram Stories Categories (Mobile Only) */}
        <div className="stories-container">
          <button
            className={`story-item ${activeTab === "sweets" ? "active" : ""}`}
            onClick={() => setActiveTab("sweets")}
          >
            <div className="story-circle">
              <span className="story-emoji">🧁</span>
            </div>
            <span className="story-label">الكل</span>
          </button>
          {/* Wishlist story item */}
          <button
            className={`story-item ${activeTab === "wishlist" ? "active" : ""}`}
            onClick={() => setActiveTab("wishlist")}
          >
            <div className="story-circle wishlist-circle">
              <span className="story-emoji">❤️</span>
            </div>
            <span className="story-label">المفضلة</span>
          </button>
          {categories.map((category) => (
            <button
              key={category}
              className={`story-item ${activeTab === category ? "active" : ""}`}
              onClick={() => setActiveTab(category)}
            >
              <div className="story-circle">
                <span className="story-emoji">{getCategoryIcon(category)}</span>
              </div>
              <span className="story-label">{category}</span>
            </button>
          ))}
        </div>

        {/* Text Categories (Desktop Only) */}
        <div className="category-row">
          <button className={activeTab === "sweets" ? "active" : ""} onClick={() => setActiveTab("sweets")}>
            الكل
          </button>
          <button className={activeTab === "wishlist" ? "active" : ""} onClick={() => setActiveTab("wishlist")}>
            المفضلة ❤️
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
          <ProductCard
            key={product.id}
            product={product}
            onAdd={addToCart}
            onUpdateQty={updateCartQty}
            cart={cart}
            isLiked={wishlist.includes(product.id)}
            onToggleWishlist={toggleWishlist}
          />
        ))}
        {!productsLoading && !productsError && visibleProducts.length === 0 && (
          <div className="empty-catalog-fallback" style={{ width: "100%", gridColumn: "1/-1" }}>
            {activeTab === "wishlist" ? (
              <p className="empty catalog-empty">قائمة المفضلة بتاعتك فاضية دلوقتي. اضغط على رمز القلب ❤️ على المنتجات لإضافتها هنا.</p>
            ) : (
              <p className="empty catalog-empty">مفيش منتجات مطابقة للبحث.</p>
            )}
          </div>
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

      {/* Mobile Bottom Navigation Bar (Mobile Only) */}
      <nav className="mobile-bottom-nav">
        <button
          className={activeTab === "sweets" ? "active" : ""}
          onClick={() => jumpTo("sweets")}
        >
          <Sparkles size={20} />
          <span>الكتالوج</span>
        </button>
        <button
          className={activeTab === "offers" ? "active" : ""}
          onClick={() => jumpTo("offers")}
        >
          <BadgePercent size={20} />
          <span>العروض</span>
        </button>
        <button
          className="nav-cart-btn"
          onClick={() => setCartOpen(true)}
        >
          <div className="cart-badge-wrapper">
            <ShoppingCart size={22} />
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </div>
          <span>السلة</span>
        </button>
        <a
          href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_CONTACT_NUMBER || "201031367037"}`}
          target="_blank"
          rel="noopener noreferrer"
          className="nav-whatsapp-link"
        >
          <MessageCircle size={20} />
          <span>تواصل</span>
        </a>
      </nav>

      <button className={`floating-cart ${cartBump ? "bump" : ""}`} onClick={() => setCartOpen(true)} aria-label="فتح السلة">
        <ShoppingCart />
        <span>{cartCount}</span>
      </button>

      {toast && (
        <div className={`add-toast ${toast.isError ? "toast-error" : ""}`} role="status" aria-live="polite">
          <div className="toast-icon-wrap">
            {toast.isError ? <Info size={20} /> : <Sparkles size={20} />}
          </div>
          <div className="toast-content">
            <strong>{toast.isError ? "تنبيه" : "✓ تمت الإضافة للسلة"}</strong>
            <span>{toast.productName}</span>
          </div>
          {!toast.isError && (
            <button onClick={() => setCartOpen(true)} className="toast-action-btn">
              إكمال 🛒
            </button>
          )}
          {!toast.isError && <div className="toast-progress-bar" />}
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
                      <button onClick={(e) => updateQty(index, 1, e)}><Plus size={14} /></button>
                      <button onClick={(e) => updateQty(index, -1, e)}><Minus size={14} /></button>
                      <button onClick={(e) => updateQty(index, -item.quantity, e)}><Trash2 size={14} /></button>
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

              <div className="delivery-option-section">
                <span className="section-label">موعد التوصيل</span>
                <div className="delivery-switch">
                  <button
                    key="delivery-today"
                    type="button"
                    disabled={cartForcesPreOrder}
                    className={form.deliveryOption === "today" ? "active" : ""}
                    onClick={() => setForm({ ...form, deliveryOption: "today" })}
                  >
                    ⚡ توصيل فوري (اليوم)
                  </button>
                  <button
                    key="delivery-tomorrow"
                    type="button"
                    className={form.deliveryOption === "tomorrow" ? "active" : ""}
                    onClick={() => setForm({ ...form, deliveryOption: "tomorrow" })}
                  >
                    📅 حجز مسبق (لتاني يوم)
                  </button>
                </div>
                {cartForcesPreOrder && (
                  <p className="delivery-warning">
                    ⚠️ السلة تحتوي على منتجات متاحة للحجز المسبق فقط (توصيل غداً).
                  </p>
                )}
                <div className="delivery-expected-date">
                  <span>التوصيل المتوقع:</span>
                  <strong>{displayedDeliveryDate}</strong>
                </div>
              </div>

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

      {/* Tracker Modal/Drawer */}
      {trackerOpen && (
        <aside className="cart-drawer tracker-drawer" aria-label="تتبع طلباتي">
          <div className="drawer-panel">
            <div className="drawer-head">
              <h2>تتبع طلباتك السابقة 📋</h2>
              <button onClick={() => setTrackerOpen(false)}>إغلاق</button>
            </div>

            <div className="tracker-search-box">
              <p>ادخل رقم هاتفك المسجل لعرض حالة جميع طلباتك السابقة وتفاصيلها:</p>
              <div className="tracker-input-group">
                <input
                  type="tel"
                  placeholder="مثال: 01031367037"
                  value={trackerPhone}
                  onChange={(e) => setTrackerPhone(e.target.value)}
                />
                <button onClick={searchTrackedOrders} disabled={trackerSearching}>
                  {trackerSearching ? "جاري البحث..." : "بحث 🔍"}
                </button>
              </div>
              {trackerError && <p className="tracker-error-msg">{trackerError}</p>}
            </div>

            {trackedOrders.length > 0 && (
              <div className="tracked-orders-list">
                {trackedOrders.map((order) => {
                  let activeStep = 1;
                  if (["تم التأكيد", "قيد المراجعة"].includes(order.status)) activeStep = 2;
                  else if (["جاري التحضير", "تم الشحن", "خرج للتوصيل"].includes(order.status)) activeStep = 3;
                  else if (order.status === "مكتمل") activeStep = 4;

                  let rawItems = [];
                  try {
                    rawItems = typeof order.items === "string" ? JSON.parse(order.items) : order.items;
                  } catch (e) {}

                  return (
                    <div className="tracked-order-card" key={order.id}>
                      <div className="order-card-header">
                        <strong>رقم الحجز: HA-{order.id}</strong>
                        <span className="order-card-date">{order.deliveryDate}</span>
                      </div>
                      
                      {/* Timeline component */}
                      <div className="status-timeline">
                        <div className={`status-step ${activeStep >= 1 ? "completed" : ""}`}>
                          <div className="step-bullet">1</div>
                          <span className="step-label">تم الاستلام</span>
                        </div>
                        <div className={`status-line ${activeStep >= 2 ? "completed" : ""}`} />
                        <div className={`status-step ${activeStep >= 2 ? "completed" : ""}`}>
                          <div className="step-bullet">2</div>
                          <span className="step-label">تأكيد الإيداع</span>
                        </div>
                        <div className={`status-line ${activeStep >= 3 ? "completed" : ""}`} />
                        <div className={`status-step ${activeStep >= 3 ? "completed" : ""}`}>
                          <div className="step-bullet">3</div>
                          <span className="step-label">التحضير</span>
                        </div>
                        <div className={`status-line ${activeStep >= 4 ? "completed" : ""}`} />
                        <div className={`status-step ${activeStep >= 4 ? "completed" : ""}`}>
                          <div className="step-bullet">4</div>
                          <span className="step-label">مكتمل</span>
                        </div>
                      </div>

                      <div className="order-card-details">
                        <div className="detail-row">
                          <span>طريقة الدفع:</span>
                          <strong>{order.paymentMethod === "vodafone" ? "فودافون كاش" : "انستاباي"}</strong>
                        </div>
                        <div className="detail-row">
                          <span>المطلوب تحويله:</span>
                          <strong>{money(Number(order.deposit) + Number(order.fee))}</strong>
                        </div>
                        <div className="detail-row text-danger">
                          <span>حالة الحجز الحالية:</span>
                          <strong>{order.status}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Luxury Digital Receipt Ticket Modal */}
      {lastOrder && (
        <div className="receipt-modal-overlay">
          <div className="receipt-modal-container">
            <div className="receipt-ticket">
              <div className="ticket-cutout-left" />
              <div className="ticket-cutout-right" />
              
              <div className="ticket-header">
                <div className="ticket-badge-ok">✓ تم تسجيل حجزك</div>
                <h2>هايبر أسماء</h2>
                <p>إيصال الحجز الإلكتروني</p>
              </div>

              <div className="ticket-body">
                <div className="ticket-row-info">
                  <span>رقم الحجز:</span>
                  <strong>HA-{lastOrder.id}</strong>
                </div>
                <div className="ticket-row-info">
                  <span>الاسم:</span>
                  <strong>{lastOrder.customerName}</strong>
                </div>
                <div className="ticket-row-info">
                  <span>التوصيل المتوقع:</span>
                  <strong>{lastOrder.deliveryDate}</strong>
                </div>
                <div className="ticket-row-info">
                  <span>نوع الطلب:</span>
                  <strong>{lastOrder.deliveryOption === "today" ? "توصيل اليوم" : "حجز مسبق"}</strong>
                </div>

                <div className="ticket-divider-dash" />

                <div className="ticket-items-title">المنتجات المحجوزة:</div>
                <div className="ticket-items-list">
                  {lastOrder.items.map((item, index) => (
                    <div className="ticket-item-line" key={index}>
                      <span>{item.name} × {item.quantity}</span>
                      <strong>{money(item.price * item.quantity)}</strong>
                    </div>
                  ))}
                </div>

                <div className="ticket-divider-dash" />

                <div className="ticket-row-info total-row">
                  <span>إجمالي المنتجات:</span>
                  <strong>{money(lastOrder.subtotal)}</strong>
                </div>
                <div className="ticket-row-info deposit-row">
                  <span>العربون المطلوب تحويله:</span>
                  <strong className="text-success">{money(lastOrder.deposit)}</strong>
                </div>
                <div className="ticket-row-info fee-row">
                  <span>عمولة التحويل:</span>
                  <strong>{money(lastOrder.fee)}</strong>
                </div>
                <div className="ticket-row-info final-total-row">
                  <span>المطلوب تحويله الآن:</span>
                  <strong className="text-danger">{money(lastOrder.depositTotal)}</strong>
                </div>

                <div className="ticket-payment-card">
                  <span>برجاء تحويل العربون على {lastOrder.paymentLabel}</span>
                  <strong>{lastOrder.paymentNumber}</strong>
                </div>

                <div className="ticket-barcode-wrap">
                  <div className="barcode-bars">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div
                        key={i}
                        className="barcode-bar"
                        style={{
                          width: i % 4 === 0 ? "5px" : i % 2 === 0 ? "2px" : "1px",
                          height: "40px",
                          background: "#000",
                          marginRight: "3px"
                        }}
                      />
                    ))}
                  </div>
                  <span className="barcode-label">HA-{lastOrder.id}-{Math.floor(Math.random() * 9000 + 1000)}</span>
                </div>
              </div>
            </div>

            <div className="receipt-actions">
              <button onClick={() => downloadReceiptAsImage(lastOrder)} className="btn-download-receipt">
                تنزيل الإيصال كصورة 📸
              </button>
              <button
                onClick={() => {
                  const orderItemsText = lastOrder.items
                    .map((item) => `- ${item.name} × ${item.quantity} = ${money(item.price * item.quantity)}`)
                    .join("\n");
                  const whatsappMessage = [
                    "طلب حجز جديد - هايبر أسماء",
                    "-------------------------",
                    `رقم الطلب: ${lastOrder.id}`,
                    `الاسم: ${lastOrder.customerName}`,
                    `الهاتف: ${lastOrder.phone}`,
                    `العنوان: ${lastOrder.address}`,
                    "",
                    "المنتجات:",
                    orderItemsText,
                    "",
                    `الإجمالي: ${money(lastOrder.subtotal)}`,
                    `العربون: ${money(lastOrder.deposit)}`,
                    `العمولة: ${money(lastOrder.fee)}`,
                    `المطلوب تحويله الآن: ${money(lastOrder.depositTotal)}`,
                    `نوع الطلب: ${lastOrder.deliveryOption === "today" ? "توصيل اليوم" : "حجز مسبق"}`,
                    `رقم التحويل: ${lastOrder.paymentNumber}`,
                    `التوصيل المتوقع: ${lastOrder.deliveryDate}`,
                    lastOrder.notes ? `ملاحظات: ${lastOrder.notes}` : ""
                  ]
                    .filter(Boolean)
                    .join("\n");
                  window.open(`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_ORDER_NUMBER || "201550181908"}?text=${encodeURIComponent(whatsappMessage)}`, "_blank", "noopener,noreferrer");
                }}
                className="btn-whatsapp-receipt"
              >
                إرسال الحجز للواتساب 💬
              </button>
              <button onClick={() => setLastOrder(null)} className="btn-close-receipt">
                إغلاق والعودة للمتجر
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function ProductCard({ product, onAdd, onUpdateQty, cart }) {
  const [customPrice, setCustomPrice] = useState(product.price);
  const [addedEffect, setAddedEffect] = useState(false);
  const soldOut = !product.available;
  const hasLimitedStock = product.stock !== null && product.stock !== undefined;
  const stockLeft = hasLimitedStock ? Number(product.stock) : null;
  const isOutOfStockToday = hasLimitedStock && stockLeft <= 0;

  const hasOffer = Boolean(product.offerActive) && Number(product.originalPrice) > Number(product.price);
  const savings = hasOffer ? Number(product.originalPrice) - Number(product.price) : 0;

  const cartQty = cart
    .filter((item) => item.id === product.id)
    .reduce((sum, item) => sum + item.quantity, 0);

  function handleAdd(event, forceOpenCart = false, defaultDeliveryOption = null) {
    if (soldOut) return;
    onAdd(product, customPrice, forceOpenCart, defaultDeliveryOption, event);
    setAddedEffect(true);
    window.setTimeout(() => setAddedEffect(false), 900);
  }

  return (
    <article className="product-card">
      <div className="image-wrap">
        <LazyProductImage product={product} />
        {hasOffer && (
          <span className="offer-ribbon">عرض</span>
        )}
        {hasLimitedStock && !soldOut && (
          <span className={`stock-badge ${stockLeft <= 0 ? "stock-low" : ""}`}>
            {stockLeft <= 0 ? "حجز مسبق" : `متاح اليوم: ${stockLeft}`}
          </span>
        )}
        {soldOut && <div className="soldout">Sold<br />Out</div>}
      </div>
      <h3>{product.name}</h3>
      <p>{product.category}</p>
      <div className="price-stack">
        {hasOffer && (
          <span className="old-price">بدل {money(product.originalPrice)}</span>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexWrap: "wrap" }}>
          <strong className="price">{money(product.price)}</strong>
          {hasOffer && savings > 0 && (
            <span className="savings-badge">
              وفرت {money(savings)}!
            </span>
          )}
        </div>
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

      {soldOut ? (
        <button disabled className="btn-sold-out">
          غير متاح حالياً ×
        </button>
      ) : cartQty > 0 ? (
        <div className="product-stepper">
          <button onClick={(e) => onUpdateQty(product.id, -1, e)} className="stepper-btn" aria-label="تقليل الكمية">
            <Minus size={16} />
          </button>
          <span className="stepper-val">{cartQty}</span>
          <button onClick={(e) => onUpdateQty(product.id, 1, e)} className="stepper-btn" aria-label="زيادة الكمية">
            <Plus size={16} />
          </button>
        </div>
      ) : (
        <div className="product-actions">
          {isOutOfStockToday ? (
            <button
              onClick={(e) => handleAdd(e, true, "tomorrow")}
              className="btn-order-now preorder-only"
            >
              <Clock3 size={16} /> حجز غداً
            </button>
          ) : (
            <button
              onClick={(e) => handleAdd(e, true, "today")}
              className="btn-order-now"
            >
              <Zap size={16} /> طلب الآن
            </button>
          )}
          <button
            onClick={(e) => handleAdd(e, false, null)}
            className={`btn-add-to-cart ${addedEffect ? "btn-success" : ""}`}
          >
            {addedEffect ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                ✓ تمت
              </span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                <Plus size={15} /> السلة
              </span>
            )}
          </button>
        </div>
      )}
    </article>
  );
}
