import localFont from "next/font/local";

export const poppins = localFont({
  variable: "--font-poppins",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  src: [
    { path: "../fonts/poppins-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/poppins-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/poppins-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "../fonts/poppins-latin-700-normal.woff2", weight: "700", style: "normal" },
  ],
});

export const lora = localFont({
  variable: "--font-lora",
  display: "swap",
  fallback: ["Georgia", "serif"],
  src: [
    { path: "../fonts/lora-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/lora-latin-400-italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/lora-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/lora-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});

export const jetbrains = localFont({
  variable: "--font-jetbrains",
  display: "swap",
  fallback: ["ui-monospace", "Menlo", "Consolas", "monospace"],
  src: [
    { path: "../fonts/jetbrains-mono-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "../fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "../fonts/jetbrains-mono-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
});
