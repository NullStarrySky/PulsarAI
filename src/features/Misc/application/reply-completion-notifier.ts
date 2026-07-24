import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@choochmeque/tauri-plugin-notifications-api";
import { useRuntimePreferenceStore } from "./runtime-preference-store";

let audioContext: AudioContext | null = null;

export async function notifyReplyCompleted(input: { title?: string; body?: string } = {}) {
  const preferences = useRuntimePreferenceStore();
  if (preferences.replyCompletionOnlyWhenBackground && !document.hidden) {
    return;
  }

  if (preferences.playSoundOnReplyComplete) {
    playCompletionSound();
  }

  if (preferences.notifyOnReplyComplete) {
    await sendReplyCompletionNotification(input);
  }
}

export async function ensureNotificationPermission() {
  const granted = await isPermissionGranted();
  if (granted) {
    return true;
  }
  return (await requestPermission()) === "granted";
}

async function sendReplyCompletionNotification(input: { title?: string; body?: string }) {
  if (!(await ensureNotificationPermission())) {
    return;
  }

  await sendNotification({
    title: input.title || "Pulsar",
    body: input.body || "回复已完成。",
    autoCancel: true,
  });
}

function playCompletionSound() {
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch {
    // Audio can be blocked by the runtime or OS policy; notification still works independently.
  }
}
