import "dotenv/config";

/**
 * Central config. `dotenv/config` runs on import so process.env is populated
 * from server/.env before anything below reads it.
 *
 * This app needs only ONE secret: SWARAM_API_KEY (your swaram.live API key).
 */
export const config = {
  port: Number(process.env.PORT ?? 8090),
  swaram: {
    apiKey: process.env.SWARAM_API_KEY ?? "",
    baseUrl: process.env.SWARAM_BASE_URL ?? "https://api.swaram.live",
  },
  // Comma-separated list of allowed CORS origins (the Vite dev server).
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim()),
} as const;

export function warnMissingConfig(): void {
  if (!config.swaram.apiKey) {
    console.warn(
      "[config] SWARAM_API_KEY is not set — /api/swaram-token will return 503 until it is. Copy .env.example to .env and add your key."
    );
  }
}
