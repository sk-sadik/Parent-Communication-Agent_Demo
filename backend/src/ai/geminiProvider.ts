// Gemini implementation of AiProvider, using the official @google/genai SDK.
//
// API used (verified against @google/genai 3.6.1 types):
//   new GoogleGenAI({ apiKey, httpOptions: { timeout, retryOptions } })
//   ai.models.generateContent({ model, contents, config: { systemInstruction,
//     maxOutputTokens, temperature } })
//   response.text, response.usageMetadata.promptTokenCount / candidatesTokenCount
//
// SDK-level retries are disabled so the bounded backoff in explanationService is
// the only retry policy. The API key is never logged.

import { GoogleGenAI } from "@google/genai";
import type { AiGenerateRequest, AiGenerateResult, AiProvider } from "./types.js";

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  maxOutputTokens: number;
  timeoutMs: number;
}

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";

  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly maxOutputTokens: number;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model;
    this.maxOutputTokens = options.maxOutputTokens;
    this.client = new GoogleGenAI({
      apiKey: options.apiKey,
      httpOptions: {
        timeout: options.timeoutMs,
        retryOptions: { attempts: 1 },
      },
    });
  }

  async generate(request: AiGenerateRequest): Promise<AiGenerateResult> {
    const startedAt = Date.now();

    const response = await this.client.models.generateContent({
      model: this.model,
      contents: request.prompt,
      config: {
        systemInstruction: request.systemInstruction,
        maxOutputTokens: this.maxOutputTokens,
        temperature: 0.4,
      },
    });

    const text = (response.text ?? "").trim();
    if (!text) {
      throw new Error("Gemini returned an empty reply");
    }

    return {
      text,
      model: this.model,
      inputTokens: response.usageMetadata?.promptTokenCount,
      outputTokens: response.usageMetadata?.candidatesTokenCount,
      latencyMs: Date.now() - startedAt,
    };
  }
}
