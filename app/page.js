import ShopClient from "@/components/ShopClient";
import { listProducts, listCategories } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const [products, categories] = await Promise.all([
      listProducts(),
      listCategories().catch(() => [])
    ]);
    return <ShopClient initialProducts={products} initialCategories={categories} />;
  } catch {
    return <ShopClient initialProductsError="تعذر تحميل المنتجات. جرب تحديث الصفحة." />;
  }
}
