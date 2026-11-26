// Tests never call the real Gemini API. Every test file starts with a mock
// provider; tests that need specific replies replace it.
import { MockAiProvider } from "../src/ai/mockProvider.js";
import { setAiProvider } from "../src/ai/runtime.js";

setAiProvider(new MockAiProvider());
