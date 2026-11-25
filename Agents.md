# PROJECT: Parent Communication Agent (DEMO)
A school-to-parent communication DEMO. Parents talk to an AI agent on TELEGRAM (instead of a Flutter app). Teachers also use Telegram. Student team project; keep code simple and readable.

# ENVIRONMENT
- Windows 11, PowerShell. Node.js v24, npm 11, Git. Do not use bash-only commands or scripts; everything must work on Windows (use cross-platform npm scripts).
- PostgreSQL: either local or hosted (e.g. Neon). Code must work with both. Use DATABASE_URL (app) and DIRECT_URL (migrations) in the Prisma datasource; they may be the same value.

# FIXED TECH STACK (do not change or add alternatives)
- Node.js + TypeScript (run with tsx in dev), Fastify, Zod, Prisma, PostgreSQL
- Telegram: grammY, LONG POLLING only (no webhooks, no public URL). Run the bot in only one process.
- AI: official Google Gen AI SDK for Node (package @google/genai; verify the API against the installed package types, never guess), called ONLY from the backend behind an AiProvider interface. Model name from env AI_MODEL, never hardcoded.
- Tests: Vitest
- Do NOT add: Flutter, Firebase/FCM, pg-boss, Redis, response caching, React dashboard, placement module, complaints module, PDF/Excel import, Docker.

# ENV VARIABLES (validate with Zod at startup; keep .env.example updated; .env is gitignored)
DATABASE_URL, DIRECT_URL, TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, AI_MODEL, AI_MAX_OUTPUT_TOKENS (default 600), PORT

# NON-NEGOTIABLE ARCHITECTURE RULES
1. Code retrieves and calculates; the AI only explains. Attendance %, averages, trends and fee dues are computed by backend code, never by the AI.
2. Every parent request flows: telegram chat_id -> guardian -> allowed children (child-level authorization) -> data retrieval. All data access goes through the authorization service.
3. Every table has institute_id; enforce institute scoping centrally in the repository/service layer.
4. Send the AI only minimal, pseudonymized, pre-calculated facts (e.g. "Student A"). No phone numbers, addresses or real-looking identifiers.
5. Output validator: every number, date and name in an AI reply must match the calculated facts. On mismatch: regenerate once, then fall back to the deterministic template or escalate.
6. Parents never see raw errors or stack traces. Use safe fallback messages.
7. Telegram is a DEMO-ONLY channel. SYNTHETIC data only. Never log or commit secrets.
8. Define a NotificationChannel interface (send(guardianId, message)) with a TelegramChannel implementation.
9. The welcome message tells parents they are talking to an AI assistant. Advice never labels ("weak", "lazy") or compares children.
10. Support English and Telugu (per-guardian saved language).
11. Write every important action (linking, question, answer, approval, escalation, fee reminder) to an append-only audit_log.
12. Bounded retries with exponential backoff on AI 429/resource-exhausted errors; never retry forever; log request count and token usage.

# WORKING RULES
- Work on ONE phase at a time. State a short plan first, build, run tests, summarize what was built and how I can verify it, commit to Git, then STOP and wait for me to say "continue".
- Do not start the next phase or add features outside the current phase.
- If something is unclear or an assumption is needed, ask me or state the assumption clearly.