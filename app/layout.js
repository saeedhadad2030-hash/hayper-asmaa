import "./globals.css";

export const metadata = {
  title: "هايبر أسماء",
  description: "متجر هايبر أسماء للحجز المسبق"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
