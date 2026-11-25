// Telegram error text can contain API URLs. Redact anything that looks like a
// bot token before it reaches a log or a reply.
const TOKEN_PATTERN = /bot\d+:[A-Za-z0-9_-]{10,}/g;

export function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(TOKEN_PATTERN, "bot<redacted>");
}
