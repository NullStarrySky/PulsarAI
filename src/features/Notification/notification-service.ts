import {
  isPermissionGranted,
  requestPermission,
  sendNotification as sendExternalNotification,
} from "@choochmeque/tauri-plugin-notifications-api";
import { useNotificationStore } from "./notification-store";
import type { SendPulsarNotificationInput } from "./notification";

export async function sendNotification(
  input: SendPulsarNotificationInput = {},
) {
  if ((input.channel ?? "external") === "internal") {
    return useNotificationStore().add(input);
  }

  if (!(await ensureNotificationPermission())) {
    return false;
  }
  await sendExternalNotification({
    title: input.title || "Pulsar",
    body: input.body || "你有一条新通知。",
    autoCancel: true,
  });
  return true;
}

export async function ensureNotificationPermission() {
  const granted = await isPermissionGranted();
  if (granted) {
    return true;
  }
  return (await requestPermission()) === "granted";
}
