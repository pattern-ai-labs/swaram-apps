import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Ports are configurable via env so the app can run alongside others:
//   CLIENT_PORT  the Vite dev server port            (default 5173)
//   API_PORT     the Express server to proxy /api to  (default 8090, matches server PORT)
const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 5173);
const API_PORT = Number(process.env.API_PORT ?? 8090);

export default defineConfig({
  plugins: [react()],
  server: {
    port: CLIENT_PORT,
    // Forward /api/* to the Express server during dev.
    proxy: {
      "/api": `http://localhost:${API_PORT}`,
    },
    // If you expose this through a tunnel (e.g. Cloudflare), add its hostname:
    // allowedHosts: ["your-app.example.com"],
  },
});
