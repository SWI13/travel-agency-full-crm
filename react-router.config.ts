import type { Config } from "@react-router/dev/config";
import { vercelPreset } from "@vercel/react-router/vite";

export default {
  ssr: true,
  // On Vercel, build server functions in Vercel's format. Everywhere else
  // (local, Docker, Railway…) keep the standard Node server build.
  presets: process.env.VERCEL ? [vercelPreset()] : [],
} satisfies Config;
