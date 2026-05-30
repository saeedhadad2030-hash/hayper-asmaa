import { isAdmin, unauthorized } from "@/lib/auth";
import { listOrders, updateOrder } from "@/lib/store";
import { ORDER_STATUSES, readOrderItems } from "@/lib/shop";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const orders = (await listOrders()).map((order) => ({
    ...order,
    items: readOrderItems(order.items)
  }));
  return Response.json({ orders });
}

export async function PATCH(request) {
  if (!(await isAdmin())) return unauthorized();
  const body = await request.json();
  const status = ORDER_STATUSES.includes(body.status) ? body.status : "في انتظار التحويل";
  const deliveryFee = body.deliveryFee === "" || body.deliveryFee == null ? null : Number(body.deliveryFee);
  await updateOrder(Number(body.id), { status, deliveryFee });
  return Response.json({ ok: true });
}
