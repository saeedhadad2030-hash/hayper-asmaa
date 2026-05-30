import { createOrder, getProduct } from "@/lib/store";
import { calculateDeposit, getDeliveryDate, getPaymentMeta } from "@/lib/shop";

export const runtime = "nodejs";

function normalizeText(value) {
  return String(value || "").trim();
}

export async function POST(request) {
  const body = await request.json();
  const items = Array.isArray(body.items) ? body.items : [];

  if (!normalizeText(body.customerName) || !normalizeText(body.phone) || !normalizeText(body.address)) {
    return Response.json({ error: "بيانات العميل غير مكتملة" }, { status: 400 });
  }

  if (items.length === 0) {
    return Response.json({ error: "السلة فارغة" }, { status: 400 });
  }

  const cleanItems = [];
  let subtotal = 0;

  for (const item of items) {
    const product = await getProduct(Number(item.id));

    if (!product || !product.available) {
      return Response.json({ error: "في منتج غير متاح داخل السلة" }, { status: 400 });
    }

    const quantity = Math.max(1, Number(item.quantity) || 1);
    const customPrice = Number(item.customPrice);
    const unitPrice = product.variablePrice && customPrice > 0 ? customPrice : product.price;
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;
    cleanItems.push({
      id: product.id,
      name: product.name,
      category: product.category,
      quantity,
      unitPrice,
      lineTotal
    });
  }

  const paymentMethod = body.paymentMethod === "vodafone" ? "vodafone" : "instapay";
  const payment = getPaymentMeta(paymentMethod);
  const deposit = calculateDeposit(subtotal, paymentMethod);
  const status = "في انتظار التحويل";

  const deliveryDate = getDeliveryDate();
  const orderId = await createOrder({
    customerName: normalizeText(body.customerName),
    phone: normalizeText(body.phone),
    address: normalizeText(body.address),
    notes: normalizeText(body.notes),
    items: JSON.stringify(cleanItems),
    subtotal,
    deposit: deposit.depositBase,
    fee: deposit.fee,
    paymentMethod,
    paymentNumber: payment.number,
    receiptImage: null,
    status,
    deliveryDate
  });

  return Response.json({
    order: {
      id: Number(orderId),
      subtotal,
      deposit: deposit.depositBase,
      fee: deposit.fee,
      depositTotal: deposit.depositTotal,
      paymentNumber: payment.number,
      deliveryDate,
      status
    }
  });
}
