import { isAdmin, unauthorized } from "@/lib/auth";
import { listOrders } from "@/lib/store";
import { readOrderItems } from "@/lib/shop";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const orders = await listOrders();
  const confirmed = orders.filter((order) => ["مؤكد", "تم التسليم"].includes(order.status));
  const summary = {
    totalOrders: orders.length,
    confirmedOrders: confirmed.length,
    sales: confirmed.reduce((sum, order) => sum + Number(order.subtotal || 0), 0)
  };
  const productMap = new Map();
  for (const order of confirmed) {
    for (const item of readOrderItems(order.items)) {
      const current = productMap.get(item.name) || 0;
      productMap.set(item.name, current + Number(item.quantity || 0));
    }
  }
  const topProducts = Array.from(productMap.entries())
    .map(([name, quantity]) => ({ name, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 6);

  return Response.json({
    stats: {
      totalOrders: Number(summary.totalOrders || 0),
      confirmedOrders: Number(summary.confirmedOrders || 0),
      sales: Number(summary.sales || 0),
      conversionRate: summary.totalOrders ? Math.round((summary.confirmedOrders / summary.totalOrders) * 100) : 0,
      topProducts
    }
  });
}
