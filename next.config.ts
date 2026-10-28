import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // pdf-parse (pdf.js plus a native canvas binding) cannot be bundled by webpack: the Sentinel
  // extraction route failed on load with "Object.defineProperty called on non-object" until these
  // were left as plain runtime requires.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas", "tesseract.js"],
  // Vercel's build-time file tracer cannot see pdfkit's dynamic
  // require() calls for its standard font files (Helvetica.cjs etc.),
  // so those files get silently excluded from the deployed function
  // bundle unless explicitly included here. Scoped to the PDF export
  // route only, not applied globally.
  outputFileTracingIncludes: {
    "/api/sentinel/export/pdf": ["./node_modules/pdfkit/js/**/*"],
    // Tesseract's worker script, its WebAssembly core and the English model are loaded by path at run time, which the
    // file tracer cannot see either. Scoped to the OCR route only.
    "/api/sentinel/ocr": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/**/*",
    ],
  },
};
export default nextConfig;
