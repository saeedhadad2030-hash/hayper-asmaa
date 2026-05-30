import ShopClient from "@/components/ShopClient";
import { listProducts } from "@/lib/store";

export const revalidate = 60;

function serializeProducts(products) {
  return JSON.parse(JSON.stringify(products || []));
}

export default async function HomePage() {
  try {
    const products = await listProducts();
    return <ShopClient initialProducts={serializeProducts(products)} />;
  } catch {
    return <ShopClient initialProducts={[]} initialProductsError="تعذر تحميل المنتجات. جرب تحديث الصفحة." />;
  }
}
