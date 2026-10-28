export const DEFAULT_CHAT_MODEL = 'nvidia/nemotron-3.5-super-vl:free';
export const CHAT_MODELS = [DEFAULT_CHAT_MODEL, 'recursive/flint-v1.0:free', 'xingchen-agi/xing4.0-29b-a4b:free'];
export const CHAT_MODEL_LABELS = {
  [DEFAULT_CHAT_MODEL]: 'Nemotron 3.5 Super VL · free',
  'recursive/flint-v1.0:free': 'Flint v1.0 · free',
  'xingchen-agi/xing4.0-29b-a4b:free': 'Xing4.0 29B A4B · free',
};
export const EMBEDDING_MODEL = 'nvidia/nemotron-3.5-embed-1b:free';
export const LEGACY_AI_MESSAGE = 'This vault uses a retired AI provider. Export it first, then use Replace credentials with an OpenRouter key and re-enter every credential you want to retain. The saved vault was not changed.';

export function validateAI(input) {
  // Never reinterpret an older provider's key as a gateway credential.
  if (input.openaiKey) throw new Error(LEGACY_AI_MESSAGE);
  const openrouterKey = input.openrouterKey ?? '';
  if (typeof openrouterKey !== 'string' || (openrouterKey &&
    (openrouterKey.length < 12 || openrouterKey.length > 512 || !/^[\x21-\x7e]+$/.test(openrouterKey))))
    throw new Error('Enter a valid OpenRouter API key.');
  const chatModel = input.chatModel ?? DEFAULT_CHAT_MODEL;
  if (openrouterKey && !CHAT_MODELS.includes(chatModel)) throw new Error('Choose a supported free assistant model.');
  return { ...(openrouterKey ? { openrouterKey, chatModel } : {}) };
}
