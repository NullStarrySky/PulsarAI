export type NotificationChannel = "external" | "internal";
export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface PulsarNotification {
  id: string;
  title: string;
  body: string;
  level: NotificationLevel;
  createdAt: string;
  read: boolean;
}

export interface SendPulsarNotificationInput {
  title?: string;
  body?: string;
  level?: NotificationLevel;
  channel?: NotificationChannel;
}
