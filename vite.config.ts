import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), tsconfigPaths(), reactRouter()],
  ssr: {
    // Syncfusion ships CommonJS-flavoured ESM that must be bundled for SSR.
    noExternal: [/@syncfusion/],
  },
  // Pre-bundle heavy dependencies up front so the dev server never re-optimises mid-session.
  optimizeDeps: {
    include: ["lucide-react", "clsx", "tailwind-merge", "zod", "node-appwrite"],
  },
  server: { port: 5173, strictPort: false },
});
