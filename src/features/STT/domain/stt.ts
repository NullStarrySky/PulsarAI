import type { HydratableModel } from "@/features/ModelConnection/application/model-ai";

export interface SpeechToTextServiceOptions {
  model?: HydratableModel;
  audio: string | Uint8Array | ArrayBuffer | URL;
  language?: string;
}

export interface SystemSpeechRecognitionOptions {
  language?: string;
  maxDuration?: number;
  onDevice?: boolean;
}

export interface SystemSpeechRecognitionResult {
  transcript: string;
  isFinal: boolean;
  confidence?: number;
}

export interface SystemSpeechRecognitionError {
  code: string;
  message: string;
  details?: string;
}
