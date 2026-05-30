export const PAYMENT = {
  vodafone: {
    label: "فودافون كاش",
    number: "01031367037",
    feeRate: 0.01
  },
  instapay: {
    label: "انستا باي",
    number: "01065260926",
    feeRate: 0
  }
};

export const ORDER_STATUSES = [
  "في انتظار التحويل",
  "في انتظار مراجعة الإيصال",
  "مؤكد",
  "مرفوض",
  "تم التسليم"
];

export function money(value) {
  return `${Number(value || 0).toLocaleString("ar-EG", {
    maximumFractionDigits: 2
  })} ج.م`;
}

export function getPaymentMeta(method) {
  return PAYMENT[method] || PAYMENT.instapay;
}

export function calculateDeposit(subtotal, method) {
  const depositBase = Number(subtotal) / 2;
  const fee = method === "vodafone" && Number(subtotal) > 0 ? Math.ceil(Number(subtotal) / 100) : 0;
  return {
    depositBase,
    fee,
    depositTotal: depositBase + fee
  };
}

export function getDeliveryDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .formatToParts(now)
    .reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const daysToAdd = Number(parts.hour) >= 21 ? 2 : 1;
  const cairoDay = new Date(
    Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  );
  cairoDay.setUTCDate(cairoDay.getUTCDate() + daysToAdd);

  return new Intl.DateTimeFormat("ar-EG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC"
  }).format(cairoDay);
}

export function readOrderItems(items) {
  if (Array.isArray(items)) return items;
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
