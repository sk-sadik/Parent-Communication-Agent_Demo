// Deterministic provider for tests and for running the evaluation offline.
// It never touches the network.

import type { AiGenerateRequest, AiGenerateResult, AiProvider } from "./types.js";

const DEFAULT_EN =
  "The student is making steady progress, and small steps at home make a real difference. " +
  "• Praise one thing the student did well this week. " +
  "• Set aside a short, calm practice time each day. " +
  "• Ask the student to explain one topic they learned.";

const DEFAULT_TE =
  "విద్యార్థి స్థిరంగా ముందుకు సాగుతున్నారు. ఇంట్లో చిన్న ప్రయత్నాలు మంచి మార్పు తెస్తాయి. " +
  "• ఈ వారం విద్యార్థి బాగా చేసిన ఒక విషయాన్ని మెచ్చుకోండి. " +
  "• ప్రతి రోజు కొద్దిసేపు ప్రశాంతంగా సాధన చేయించండి. " +
  "• విద్యార్థి నేర్చుకున్న ఒక అంశాన్ని మీకు వివరించమని అడగండి.";

export type MockReply =
  | string
  | ((request: AiGenerateRequest) => string | Promise<string>);

export interface MockAiOptions {
  /** Fixed reply, or a function that can vary per call (e.g. invalid then valid). */
  reply?: MockReply;
  /** When set, every call throws this error instead of returning text. */
  error?: unknown;
}

export class MockAiProvider implements AiProvider {
  readonly name = "mock";
  readonly calls: AiGenerateRequest[] = [];

  private readonly options: MockAiOptions;

  constructor(options: MockAiOptions = {}) {
    this.options = options;
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    this.calls.push(request);

    if (this.options.error !== undefined) {
      throw this.options.error;
    }

    const reply = this.options.reply;
    const text =
      typeof reply === "function"
        ? await reply(request)
        : (reply ??
          (request.systemInstruction.includes("Telugu") ? DEFAULT_TE : DEFAULT_EN));

    return {
      text,
      model: "mock",
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
    };
  }
}
