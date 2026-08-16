import {
  getVoices,
  isInitialized,
  isSpeaking,
  previewVoice,
  speak,
  stop,
} from "tauri-plugin-tts-api";
import type { SystemSpeechVoice, SystemSpeakRequest } from "../tts";

export async function speakWithSystemTts(request: SystemSpeakRequest) {
  const text = request.text.trim();
  if (!text) throw new Error("系统 TTS 文本不能为空。");
  await speak({
    text,
    language: request.language ?? null,
    voiceId: request.voiceId ?? null,
    rate: request.rate ?? null,
    pitch: request.pitch ?? null,
    volume: request.volume ?? null,
    queueMode: request.queueMode ?? null,
  });
}

export async function stopSystemTts() {
  await stop();
}

export async function isSystemTtsSpeaking() {
  return isSpeaking();
}

export async function getSystemTtsStatus() {
  return isInitialized();
}

export async function listSystemTtsVoices(language?: string): Promise<SystemSpeechVoice[]> {
  return (await getVoices(language?.trim() || undefined)).map((voice) => ({
    id: voice.id,
    name: voice.name,
    language: voice.language,
  }));
}

export async function previewSystemTtsVoice(voiceId: string, text?: string) {
  await previewVoice({ voiceId, text: text?.trim() || null });
}
