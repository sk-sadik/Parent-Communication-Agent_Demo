// All parent/teacher-facing text. English and Telugu (per-guardian language).
// No secrets, IDs or internal details belong in these strings.

import type { Language } from "../generated/prisma/enums.js";
import type { QuestionCategory } from "../services/classifier.js";

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
        "మీరు ఇప్పుడు AI సహాయకుడితో మాట్లాడుతున్నారు. ఇది మీ పిల్లల హాజరు, మార్కులు, ఫీజు వివరాలు " +
        "మరియు పాఠశాల ప్రకటనలను అందిస్తుంది. ఇది ఉపాధ్యాయుల స్థానాన్ని భర్తీ చేయదు.\n\n" +
        "మీరు ఇలా అడగవచ్చు:\n" +
        "• నా పిల్లల హాజరు ఎలా ఉంది?\n" +
        "• మార్కులు ఎలా ఉన్నాయి?\n" +
        "• ఫీజు బాకీ ఉందా?\n" +
        "• తరగతికి ఏమైనా ప్రకటనలు ఉన్నాయా?\n\n" +
        "భాష మార్చడానికి /language పంపండి."
      );
    }

    return (
      `Welcome, ${name}!\n\n` +
      "You are talking to an AI assistant. It shares attendance, marks, fee updates and school " +
      "announcements for your child, and never replaces your child's teacher.\n\n" +
      "You can ask questions like:\n" +
      "• What is my child's attendance?\n" +
      "• How are the marks?\n" +
      "• Are there any fees due?\n" +
      "• Any announcements for the class?\n\n" +
      "To change your language, send /language."
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
      "If you need to change it, please contact the school office.\n" +
      "To change your language, send /language.\n\n" +
      "ఈ టెలిగ్రామ్ ఖాతా ఇప్పటికే పాఠశాల ఖాతాకు లింక్ అయింది. మార్పు కోసం పాఠశాల కార్యాలయాన్ని సంప్రదించండి.\n" +
      "భాష మార్చడానికి /language పంపండి."
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

  chooseChild(language: Language): string {
    if (language === "te") {
      return "మీరు ఏ పిల్లల గురించి అడుగుతున్నారు? దయచేసి క్రింద ఎంచుకోండి.";
    }
    return "Which child do you mean? Please choose below.";
  },

  otherQuestion(language: Language): string {
    if (language === "te") {
      return (
        "నేను మీ పిల్లల హాజరు, మార్కులు, ఫీజు మరియు తరగతి ప్రకటనల గురించి సహాయం చేయగలను. " +
        "ఇతర ప్రశ్నల కోసం దయచేసి మీ పిల్లల ఉపాధ్యాయుడిని సంప్రదించండి. " +
        "ఈ డెమోలో ఉపాధ్యాయుడికి ప్రశ్న పంపే సౌకర్యం ఇంకా అందుబాటులో లేదు."
      );
    }
    return (
      "I can help with attendance, marks, fees and class announcements for your child. " +
      "For other questions, please contact your child's teacher. " +
      "Sending a question to a teacher is not available in this demo yet."
    );
  },

  escalated(language: Language): string {
    if (language === "te") {
      return (
        "మీ ప్రశ్నకు ధన్యవాదాలు. మీ ప్రశ్నను మీ పిల్లల ఉపాధ్యాయుడికి పంపాను. " +
        "ఉపాధ్యాయుడు ఇక్కడ మీకు సమాధానం ఇస్తారు. ఇలాంటి ప్రశ్నలకు నేను స్వయంగా సమాధానం ఇవ్వలేను."
      );
    }
    return (
      "Thank you for telling me. I have sent your question to your child's teacher, " +
      "and a teacher will reply to you here. I cannot answer this kind of question myself."
    );
  },

  noData(category: QuestionCategory, studentName: string, language: Language): string {
    const subject =
      category === "attendance"
        ? { en: "attendance records", te: "హాజరు నమోదులు" }
        : category === "marks" || category === "progress"
          ? { en: "marks records", te: "మార్కుల నమోదులు" }
          : category === "fees"
            ? { en: "fee records", te: "ఫీజు నమోదులు" }
            : { en: "approved announcements", te: "ఆమోదించిన ప్రకటనలు" };

    if (language === "te") {
      return (
        `${studentName} కోసం ${subject.te} ఇంకా లేవు, కాబట్టి నేను అంచనా వేయలేను. ` +
        "ఇది తప్పుగా అనిపిస్తే దయచేసి పాఠశాల కార్యాలయాన్ని సంప్రదించండి."
      );
    }
    return (
      `There are no ${subject.en} for ${studentName} yet, so I cannot calculate an answer. ` +
      "If this looks wrong, please contact the school office."
    );
  },

  noChildren(language: Language): string {
    if (language === "te") {
      return (
        "ఈ ఖాతాకు ధృవీకరించిన పిల్లలు ఎవరూ లింక్ కాలేదు. " +
        "దయచేసి పాఠశాల కార్యాలయాన్ని సంప్రదించండి."
      );
    }
    return (
      "No verified child is linked to this account yet. Please contact the school office."
    );
  },

  notAllowed(language: Language): string {
    if (language === "te") {
      return "మీరు మీ పిల్లల సమాచారాన్ని మాత్రమే చూడగలరు.";
    }
    return "You can only see information for your own children.";
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
