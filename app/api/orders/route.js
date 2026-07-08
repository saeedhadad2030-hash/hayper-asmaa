import { createOrder, getProduct, decrementStock, getOrdersByPhone, getOrderById } from "@/lib/store";
import { calculateDeposit, getDeliveryDate, getPaymentMeta } from "@/lib/shop";
import { sendOrderEmail } from "@/lib/email";

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

  const deliveryOption = body.deliveryOption === "today" ? "today" : "tomorrow";
  const offsetDays = deliveryOption === "today" ? 0 : null;

  const cleanItems = [];
  let subtotal = 0;

  for (const item of items) {
    const product = await getProduct(Number(item.id));

    if (!product || !product.available) {
      return Response.json({ error: "في منتج غير متاح داخل السلة" }, { status: 400 });
    }

    const quantity = Math.max(1, Number(item.quantity) || 1);

    // Validate stock if ordering for today
    if (deliveryOption === "today" && product.stock !== null && product.stock !== undefined) {
      if (product.stock < quantity) {
        return Response.json(
          { error: `الكمية المطلوبة من "${product.name}" غير متوفرة للتوصيل اليوم. المتاح في المخزن: ${product.stock} قطعة.` },
          { status: 400 }
        );
      }
    }

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
  const status = "تم استلام طلبك";

  // Decrement stock if ordering for today
  if (deliveryOption === "today") {
    for (const item of cleanItems) {
      await decrementStock(item.id, item.quantity);
    }
  }

  const deliveryDate = getDeliveryDate(new Date(), offsetDays);
  const orderData = {
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
  };

  const orderId = await createOrder(orderData);

  // Send Email Notification to admin
  try {
    await sendOrderEmail(orderId, {
      ...orderData,
      depositTotal: deposit.depositTotal
    }, cleanItems);
  } catch (err) {
    console.error("Failed to send order email:", err);
  }

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

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");
  const orderId = searchParams.get("orderId");

  try {
    if (orderId) {
      const idNum = Number(orderId.replace(/[^0-9]/g, ""));
      const order = await getOrderById(idNum);
      if (!order) {
        return Response.json({ error: "الطلب غير موجود" }, { status: 404 });
      }
      return Response.json({ order });
    }

    if (!phone) {
      return Response.json({ error: "برجاء كتابة رقم الهاتف أو رقم الطلب" }, { status: 400 });
    }

    const orders = await getOrdersByPhone(phone);
    return Response.json({ orders });
  } catch (err) {
    return Response.json({ error: "فشل استرجاع الطلبات" }, { status: 500 });
  }
}
