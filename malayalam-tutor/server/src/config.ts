import "dotenv/config";

/**
 * Central config. dotenv runs on import so process.env (incl.
 * AWS_BEARER_TOKEN_BEDROCK, which the AWS SDK reads automatically) is
 * populated before any Bedrock client is constructed.
 */
export const config = {
  port: Number(process.env.PORT ?? 8090),
  awsRegion: process.env.AWS_REGION ?? "us-west-2",
  bedrockModelId:
    process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-sonnet-4-6",
  // Bearer token the AWS SDK uses for Bedrock. Surfaced here only so we can
  // warn if it's missing; the SDK reads it straight from the env var.
  bedrockBearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK ?? "",
  swaram: {
    apiKey: process.env.SWARAM_API_KEY ?? "",
    baseUrl: process.env.SWARAM_BASE_URL ?? "https://api.swaram.live",
  },
  // Comma-separated list of allowed origins for CORS (the Vite dev server).
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim()),
} as const;

export function warnMissingConfig(): void {
  if (!config.bedrockBearerToken) {
    console.warn(
      "[config] AWS_BEARER_TOKEN_BEDROCK is not set — /api/ingest will fail until it is."
    );
  }
  if (!config.swaram.apiKey) {
    console.warn(
      "[config] SWARAM_API_KEY is not set — /api/swaram-token will return 503 until it is."
    );
  }
}
