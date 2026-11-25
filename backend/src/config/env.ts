import "dotenv/config";
import { z } from "zod";

// All configuration is validated once, at startup.
// Bot/AI variables stay optional until those phases are built, so that this
// phase can run without Telegram or Gemini credentials.
// Empty strings (e.g. `TELEGRAM_BOT_TOKEN=` in .env) count as "not set".
const optionalString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: z.string().min(1, "DIRECT_URL is required"),
  PORT: z.coerce.number().int().positive().default(3000),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(600),
  TELEGRAM_BOT_TOKEN: optionalString,
  GEMINI_API_KEY: optionalString,
  AI_MODEL: optionalString,
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Print only field names and messages: never echo values, they may be secrets.
  const problems = parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
  console.error(`Invalid environment configuration: ${problems}`);
  process.exit(1);
}

export const env = parsed.data;
