import ShopClient from "@/components/ShopClient";
import { listProducts } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  try {
    const products = await listProducts({ withImages: true });
    return <ShopClient initialProducts={products} />;
  } catch {
    return <ShopClient initialProductsError="تعذر تحميل المنتجات. جرب تحديث الصفحة." />;
  }
}
