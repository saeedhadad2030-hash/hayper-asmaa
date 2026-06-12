export default function manifest() {
  return {
    name: "هايبر أسماء",
    short_name: "هايبر أسماء",
    description: "متجر هايبر أسماء للحجز المسبق",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait",
    dir: "rtl",
    lang: "ar",
    background_color: "#fffaf0",
    theme_color: "#151914",
    categories: ["shopping", "food"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ],
    shortcuts: [
      {
        name: "فتح السلة",
        short_name: "السلة",
        url: "/?cart=1",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }]
      }
    ]
  };
}
