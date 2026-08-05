import {
  checkPermission,
  getSupportedLanguages,
  isAvailable,
  onError,
  onResult,
  requestPermission,
  startListening,
  stopListening,
} from "tauri-plugin-stt-api";
import type {
  SystemSpeechRecognitionError,
  SystemSpeechRecognitionOptions,
  SystemSpeechRecognitionResult,
} from "../domain/stt";

export async function getSystemSttAvailability() {
  return isAvailable();
}

export async function getSystemSttPermission() {
  return checkPermission();
}

export async function requestSystemSttPermission() {
  return requestPermission();
}

export async function listSystemSttLanguages() {
  return (await getSupportedLanguages()).languages;
}

export async function startSystemStt(options: SystemSpeechRecognitionOptions = {}) {
  await startListening({
    language: options.language?.trim() || undefined,
    maxDuration: options.maxDuration,
    onDevice: options.onDevice,
  });
}

export async function stopSystemStt() {
  await stopListening();
}

export function onSystemSttResult(handler: (result: SystemSpeechRecognitionResult) => void) {
  return onResult(handler);
}

export function onSystemSttError(handler: (error: SystemSpeechRecognitionError) => void) {
  return onError(handler);
}
