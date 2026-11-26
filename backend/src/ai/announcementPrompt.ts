// Prompt for improving a teacher's announcement wording. The teacher's text is
// the source of truth: the model may fix grammar and tone, never the facts.

export const ANNOUNCEMENT_PROMPT_VERSION = "announce-v1";

export interface BuiltAnnouncementPrompt {
  systemInstruction: string;
  prompt: string;
  promptVersion: string;
}

const SYSTEM_INSTRUCTION = [
  "You improve the wording of a school announcement written by a teacher.",
  "",
  "Rules:",
  "- Keep every fact exactly as it is: dates, times, numbers, amounts and names must not be added, removed or changed.",
  "- Do not add new facts, promises, deadlines or contact details.",
  "- Keep the original meaning and the original language.",
  "- Fix grammar and make the message clear and friendly, but keep it short.",
  "- Use plain text only: no markdown, no emojis, no headings.",
  "- Return only the improved announcement, with no comment about your changes.",
].join("\n");

export function buildAnnouncementPrompt(original: string): BuiltAnnouncementPrompt {
  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: `Original announcement:\n"""\n${original}\n"""`,
    promptVersion: ANNOUNCEMENT_PROMPT_VERSION,
  };
}
