import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  // Vercel's build-time file tracer cannot see pdfkit's dynamic
  // require() calls for its standard font files (Helvetica.cjs etc.),
  // so those files get silently excluded from the deployed function
  // bundle unless explicitly included here. Scoped to the PDF export
  // route only, not applied globally.
  outputFileTracingIncludes: {
    "/api/sentinel/export/pdf": ["./node_modules/pdfkit/js/**/*"],
  },
};
export default nextConfig;
