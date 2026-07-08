import nodemailer from "nodemailer";
import { getEnv } from "@/lib/store";

export async function sendOrderEmail(orderId, orderDetails, items) {
  const host = getEnv("SMTP_HOST");
  const port = getEnv("SMTP_PORT") || 587;
  const user = getEnv("SMTP_USER");
  const pass = getEnv("SMTP_PASS");
  const from = getEnv("SMTP_FROM") || `"هايبر أسماء" <${user}>`;
  const to = getEnv("ADMIN_EMAIL") || user;

  // If credentials are not configured, skip silently
  if (!host || !user || !pass) {
    console.log("SMTP configurations are missing. Skipping email notification.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: {
      user,
      pass,
    },
  });

  const itemsHtml = items
    .map(
      (item) => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${item.name}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: left;">${Number(item.lineTotal || 0).toLocaleString("ar-EG")} ج.م</td>
      </tr>
    `
    )
    .join("");

  const emailHtml = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px; background-color: #fcfcfc;">
      <h2 style="color: #c92a2a; text-align: center; border-bottom: 2px solid #c92a2a; padding-bottom: 10px;">طلب جديد - هايبر أسماء 🛒</h2>
      
      <div style="background-color: #f1f3f5; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-size: 14px; line-height: 1.6;">
        <p style="margin: 5px 0;"><strong>رقم الطلب:</strong> #${orderId}</p>
        <p style="margin: 5px 0;"><strong>اسم العميل:</strong> ${orderDetails.customerName}</p>
        <p style="margin: 5px 0;"><strong>رقم الهاتف:</strong> <a href="tel:${orderDetails.phone}">${orderDetails.phone}</a></p>
        <p style="margin: 5px 0;"><strong>العنوان:</strong> ${orderDetails.address}</p>
        <p style="margin: 5px 0;"><strong>التوصيل المتوقع:</strong> ${orderDetails.deliveryDate}</p>
        <p style="margin: 5px 0;"><strong>طريقة الدفع:</strong> ${orderDetails.paymentMethod === "vodafone" ? "فودافون كاش" : "انستا باي"}</p>
        ${orderDetails.notes ? `<p style="margin: 5px 0;"><strong>ملاحظات:</strong> ${orderDetails.notes}</p>` : ""}
      </div>

      <h3 style="color: #333; border-bottom: 1px solid #ddd; padding-bottom: 5px;">المنتجات المطلوبة:</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
        <thead>
          <tr style="background-color: #e9ecef;">
            <th style="padding: 8px; text-align: right; border-bottom: 2px solid #ddd;">المنتج</th>
            <th style="padding: 8px; text-align: center; border-bottom: 2px solid #ddd;">الكمية</th>
            <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">السعر</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="text-align: left; font-size: 16px; line-height: 1.6; border-top: 2px solid #eee; padding-top: 15px;">
        <p style="margin: 5px 0;"><strong>الإجمالي:</strong> ${Number(orderDetails.subtotal || 0).toLocaleString("ar-EG")} ج.م</p>
        <p style="margin: 5px 0;"><strong>العربون المطلوب:</strong> ${Number(orderDetails.deposit || 0).toLocaleString("ar-EG")} ج.م</p>
        <p style="margin: 5px 0; color: #c92a2a;"><strong>المطلوب تحويله الآن:</strong> ${Number(orderDetails.depositTotal || 0).toLocaleString("ar-EG")} ج.م</p>
      </div>
      
      <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #868e96; border-top: 1px dashed #ddd; padding-top: 10px;">
        <p>هذا الإشعار تلقائي من موقع هايبر أسماء</p>
      </div>
    </div>
  `;

  await transporter.sendMail({
    from,
    to,
    subject: `🚨 طلب جديد رقم #${orderId} - العميل ${orderDetails.customerName}`,
    html: emailHtml,
  });
}
