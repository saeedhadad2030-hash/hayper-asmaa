import "./globals.css";
import PwaRegistration from "@/components/PwaRegistration";

export const metadata = {
  title: "هايبر أسماء",
  description: "متجر هايبر أسماء للحجز المسبق",
  manifest: "/manifest.webmanifest",
  applicationName: "هايبر أسماء",
  appleWebApp: {
    capable: true,
    title: "هايبر أسماء",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
