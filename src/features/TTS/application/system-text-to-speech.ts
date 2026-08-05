export {
  getSystemTtsStatus,
  isSystemTtsSpeaking,
  listSystemTtsVoices,
  previewSystemTtsVoice,
  speakWithSystemTts,
  stopSystemTts,
} from "../infrastructure/system-tts-client";

export const SYSTEM_TTS_SERVICE_ID = "system-tts";
