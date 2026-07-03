import React from "react";

const THEME_ITEMS = [
  { icon: "🧁", top: "7%", left: "6%", size: "46px", anim: "floatSweet", delay: "0s", duration: "13s" },
  { icon: "🛒", top: "11%", right: "7%", size: "48px", anim: "floatMarket", delay: "1.5s", duration: "15s" },
  { icon: "🍰", top: "26%", left: "14%", size: "42px", anim: "floatSweet", delay: "2.5s", duration: "12s" },
  { icon: "🥐", top: "32%", right: "16%", size: "50px", anim: "floatMarket", delay: "0.8s", duration: "14s" },
  { icon: "🍩", top: "54%", left: "5%", size: "48px", anim: "floatSweet", delay: "3.2s", duration: "16s" },
  { icon: "🏪", top: "58%", right: "5%", size: "52px", anim: "floatMarket", delay: "1.2s", duration: "17s" },
  { icon: "🍬", top: "76%", left: "18%", size: "40px", anim: "floatSweet", delay: "2s", duration: "11s" },
  { icon: "🛍️", top: "80%", right: "20%", size: "46px", anim: "floatMarket", delay: "4s", duration: "13s" },
  { icon: "🎂", top: "18%", left: "45%", size: "44px", anim: "floatSweet", delay: "1.8s", duration: "14s" },
  { icon: "🌾", top: "46%", right: "42%", size: "42px", anim: "floatMarket", delay: "3s", duration: "15s" },
  { icon: "✨", top: "68%", left: "48%", size: "36px", anim: "floatSweet", delay: "0.5s", duration: "10s" },
  { icon: "🍪", top: "6%", right: "36%", size: "42px", anim: "floatSweet", delay: "2.2s", duration: "12s" },
  { icon: "🥖", top: "88%", left: "42%", size: "44px", anim: "floatMarket", delay: "1.7s", duration: "14s" },
  { icon: "🍫", top: "40%", left: "28%", size: "38px", anim: "floatSweet", delay: "3.5s", duration: "13s" },
  { icon: "🍯", top: "85%", right: "45%", size: "40px", anim: "floatMarket", delay: "2.8s", duration: "15s" }
];

export default function AnimatedBackground() {
  return (
    <div className="animated-bg-wrapper" aria-hidden="true">
      {/* Dynamic ambient color glowing blobs */}
      <div className="bg-blob blob-emerald" />
      <div className="bg-blob blob-golden" />
      <div className="bg-blob blob-sweet" />

      {/* Floating themed market & sweets elements */}
      <div className="bg-items-container">
        {THEME_ITEMS.map((item, index) => (
          <div
            key={index}
            className="bg-floating-item"
            style={{
              top: item.top,
              left: item.left,
              right: item.right,
              fontSize: item.size,
              animationName: item.anim,
              animationDuration: item.duration,
              animationDelay: item.delay,
              animationIterationCount: "infinite",
              animationTimingFunction: "ease-in-out"
            }}
          >
            {item.icon}
          </div>
        ))}
      </div>
    </div>
  );
}
