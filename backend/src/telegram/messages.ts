// All parent/teacher-facing text. English and Telugu (per-guardian language).
// No secrets, IDs or internal details belong in these strings.

import type { Language } from "../generated/prisma/enums.js";

export const messages = {
  needCode(): string {
    return (
      "Welcome!\n\n" +
      "To link your account, send /start followed by the one-time activation code from your school.\n" +
      "Example: /start PARENT-A1B2\n\n" +
      "మీ ఖాతాను లింక్ చేయడానికి, పాఠశాల నుండి వచ్చిన ఒకసారి వాడే కోడ్‌తో /start కోడ్ పంపండి.\n" +
      "ఉదాహరణ: /start PARENT-A1B2"
    );
  },

  languagePrompt(name: string): string {
    return (
      `Hello ${name}! Your account is linked.\n` +
      "Please choose your language.\n\n" +
      "దయచేసి మీ భాషను ఎంచుకోండి."
    );
  },

  welcome(name: string, language: Language): string {
    if (language === "te") {
      return (
        `స్వాగతం, ${name}!\n\n` +
        "మీరు ఇప్పుడు AI సహాయకుడితో మాట్లాడుతున్నారు. ఇది మీ పిల్లల హాజరు, మార్కులు మరియు ఫీజు సమాచారాన్ని " +
        "అందిస్తుంది. ఇది ఉపాధ్యాయుల స్థానాన్ని భర్తీ చేయదు.\n\n" +
        "ఈ డెమోలో ఇంకా ప్రశ్నలకు సమాధానాలు అందుబాటులో లేవు. అత్యవసర విషయాల కోసం పాఠశాలను సంప్రదించండి."
      );
    }

    return (
      `Welcome, ${name}!\n\n` +
      "You are talking to an AI assistant. It shares attendance, marks and fee updates for your child " +
      "and never replaces your child's teacher.\n\n" +
      "Question answering is not enabled in this demo yet. For urgent matters, please contact the school."
    );
  },

  teacherLinked(name: string, assignedClass: string): string {
    return (
      `Hello ${name}!\n\n` +
      `You are linked as a teacher for class ${assignedClass}.\n` +
      "You will receive class announcements and parent questions for this class."
    );
  },

  // Used for invalid, expired and reused codes alike: do not tell a stranger
  // which one it was.
  linkFailed(): string {
    return (
      "We could not link this account.\n" +
      "The activation code is not valid, has expired, or has already been used. " +
      "Please ask your school for a new one-time code.\n\n" +
      "ఈ ఖాతాను లింక్ చేయలేకపోయాము. కోడ్ చెల్లనిది, గడువు ముగిసింది లేదా ఇప్పటికే ఉపయోగించబడింది. " +
      "దయచేసి పాఠశాల నుండి కొత్త కోడ్ తీసుకోండి."
    );
  },

  alreadyLinked(): string {
    return (
      "This Telegram account is already linked to a school account, so the new code was not used.\n" +
      "If you need to change it, please contact the school office.\n\n" +
      "ఈ టెలిగ్రామ్ ఖాతా ఇప్పటికే పాఠశాల ఖాతాకు లింక్ అయింది. మార్పు కోసం పాఠశాల కార్యాలయాన్ని సంప్రదించండి."
    );
  },

  unknownChat(): string {
    return (
      "This chat is not linked to a school account yet.\n" +
      "Please get an activation code from your school, then send: /start CODE\n\n" +
      "ఈ చాట్ ఇంకా పాఠశాల ఖాతాకు లింక్ కాలేదు. దయచేసి పాఠశాల నుండి యాక్టివేషన్ కోడ్ తీసుకుని /start కోడ్ పంపండి."
    );
  },

  languageNotAvailable(): string {
    return (
      "Language selection is available to parents after linking with /start CODE.\n\n" +
      "భాష ఎంపిక లింక్ అయిన తర్వాత మాత్రమే అందుబాటులో ఉంటుంది."
    );
  },

  guardianPlaceholder(language: Language): string {
    if (language === "te") {
      return (
        "మీ సందేశానికి ధన్యవాదాలు. ఈ డెమోలో ప్రశ్నలకు సమాధానాలు ఇంకా అందుబాటులో లేవు. " +
        "అత్యవసర విషయాల కోసం ఉపాధ్యాయుడిని లేదా పాఠశాల కార్యాలయాన్ని సంప్రదించండి."
      );
    }

    return (
      "Thank you for your message. Question answering is not enabled in this demo yet. " +
      "For urgent matters, please contact your child's teacher or the school office."
    );
  },

  teacherPlaceholder(): string {
    return "You are linked as a teacher. Teacher features will be enabled in a later step.";
  },

  genericError(): string {
    return (
      "Something went wrong. Please try again in a moment.\n\n" +
      "ఏదో తప్పు జరిగింది. దయచేసి కొద్దిసేపటి తర్వాత మళ్లీ ప్రయత్నించండి."
    );
  },
};
