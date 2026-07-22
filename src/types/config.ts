export interface AppConfig {
  AI_INFERENCE_ORDER: string;
  COHERE_API_KEY?: string;
  COHERE_MODEL?: string;
  MISTRAL_API_KEY?: string;
  MISTRAL_MODEL?: string;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  GROQ_API_KEY?: string;
  GROQ_MODEL?: string;
  PRIMARY_COLOR?: string;
  SECONDARY_COLOR?: string;
  ACCENT_COLOR?: string;
  TEXT_COLOR?: string;
  TEXT_LIGHT_COLOR?: string;
  BG_BADGE_COLOR?: string;
  SUCCESS_COLOR?: string;
  [key: string]: string | undefined;
}

export interface ClientSafeConfig {
  AI_INFERENCE_ORDER: string;
  availableProviders: string[];
  primaryProvider: string | null;
  PRIMARY_COLOR?: string;
  SECONDARY_COLOR?: string;
  ACCENT_COLOR?: string;
  TEXT_COLOR?: string;
  TEXT_LIGHT_COLOR?: string;
  BG_BADGE_COLOR?: string;
  SUCCESS_COLOR?: string;
  [key: string]: string | string[] | null | undefined;
}