export const CHAT_MODELS: readonly string[];
export const DEFAULT_CHAT_MODEL: string;
export const EMBEDDING_MODEL: string;
export const CHAT_MODEL_LABELS: Record<string, string>;
export const LEGACY_AI_MESSAGE: string;
export function validateAI(input: { openrouterKey?: unknown; chatModel?: unknown; openaiKey?: unknown }): { openrouterKey?: string; chatModel?: string };
