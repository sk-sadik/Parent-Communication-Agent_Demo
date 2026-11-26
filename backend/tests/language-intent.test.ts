import { describe, expect, it } from "vitest";
import { isLanguageChangeRequest } from "../src/telegram/languageIntent.js";

describe("language change intent", () => {
  it("recognises English phrasings", () => {
    expect(isLanguageChangeRequest("change language to english")).toBe(true);
    expect(isLanguageChangeRequest("Change my language to Telugu")).toBe(true);
    expect(isLanguageChangeRequest("language")).toBe(true);
    expect(isLanguageChangeRequest("English")).toBe(true);
    expect(isLanguageChangeRequest("telugu")).toBe(true);
    expect(isLanguageChangeRequest("switch to english please")).toBe(true);
    expect(isLanguageChangeRequest("reply in Telugu")).toBe(true);
    expect(isLanguageChangeRequest("english lo matladu")).toBe(true);
    expect(isLanguageChangeRequest("english lo cheppu")).toBe(true);
  });

  it("recognises Telugu phrasings", () => {
    expect(isLanguageChangeRequest("భాష మార్చండి")).toBe(true);
    expect(isLanguageChangeRequest("తెలుగు")).toBe(true);
    expect(isLanguageChangeRequest("ఇంగ్లీష్")).toBe(true);
    expect(isLanguageChangeRequest("ఇంగ్లీష్ లో చెప్పండి")).toBe(true);
    expect(isLanguageChangeRequest("bhasha marchandi")).toBe(true);
  });

  it("does not treat a school question about English as a language change", () => {
    expect(isLanguageChangeRequest("What are my child's marks in English?")).toBe(false);
    expect(isLanguageChangeRequest("English marks")).toBe(false);
    expect(isLanguageChangeRequest("marks in english language")).toBe(false);
    expect(isLanguageChangeRequest("english marks cheppandi")).toBe(false);
    expect(isLanguageChangeRequest("తెలుగు మార్కులు చెప్పండి")).toBe(false);
    expect(isLanguageChangeRequest("How is my child doing?")).toBe(false);
    expect(isLanguageChangeRequest("ఫీజు బాకీ ఉందా?")).toBe(false);
    expect(isLanguageChangeRequest("తరగతికి ప్రకటనలు ఉన్నాయా?")).toBe(false);
    expect(isLanguageChangeRequest("")).toBe(false);
  });
});
