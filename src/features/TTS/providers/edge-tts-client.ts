import type { TTSChunk, Voice } from "edge-tts-ts";
import type {
  SpeechBoundary,
  SpeechVoice,
  TextToSpeechRequest,
  TextToSpeechResult,
} from "../tts";
import { loadEdgeTts } from "./load-edge-tts";

export const EDGE_TTS_DEFAULT_VOICE = "en-US-EmmaMultilingualNeural";

function assertText(text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error("Edge TTS 文本不能为空。");
  }
  return normalized;
}

function isBoundaryChunk(chunk: TTSChunk): chunk is Extract<TTSChunk, { text: string }> {
  return chunk.type === "WordBoundary" || chunk.type === "SentenceBoundary";
}

function mapVoice(voice: Voice): SpeechVoice {
  return {
    name: voice.Name,
    shortName: voice.ShortName,
    gender: voice.Gender,
    locale: voice.Locale,
    suggestedCodec: voice.SuggestedCodec,
    friendlyName: voice.FriendlyName,
    status: voice.Status,
    contentCategories: voice.VoiceTag.ContentCategories,
    voicePersonalities: voice.VoiceTag.VoicePersonalities,
  };
}

export async function synthesizeWithEdgeTts(
  request: TextToSpeechRequest,
): Promise<TextToSpeechResult> {
  const { Communicate } = await loadEdgeTts();
  const communicate = new Communicate(assertText(request.text), {
    voice: request.voice ?? EDGE_TTS_DEFAULT_VOICE,
    rate: request.rate ?? "+0%",
    volume: request.volume ?? "+0%",
    pitch: request.pitch ?? "+0Hz",
    boundary: request.boundary ?? "WordBoundary",
  });

  const audioChunks: Uint8Array[] = [];
  const boundaries: SpeechBoundary[] = [];
  let audioBytes = 0;

  for await (const chunk of communicate.stream()) {
    if (chunk.type === "audio") {
      audioChunks.push(chunk.data);
      audioBytes += chunk.data.byteLength;
      continue;
    }

    if (isBoundaryChunk(chunk)) {
      boundaries.push(chunk);
    }
  }

  if (audioBytes === 0) {
    throw new Error("Edge TTS 没有返回音频数据。");
  }

  return {
    audio: new Blob(audioChunks, { type: "audio/mpeg" }),
    audioBytes,
    boundaries,
  };
}

export async function listEdgeTtsVoices(): Promise<SpeechVoice[]> {
  const { listVoices } = await loadEdgeTts();
  const voices = await listVoices();
  return voices.map(mapVoice);
}
