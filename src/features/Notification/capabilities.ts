import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { sendNotification } from "./application/notification-service";
import { useNotificationStore } from "./application/notification-store";

export const capabilities: CapabilityDefinition = {
  id: "notification",
  title: "通知",
  description: "发送系统外部通知或写入 Pulsar 内置通知中心。",
  subCaps: {
    all: "全部通知权限",
    read: "读取内置通知",
    sendInternal: "发送内置通知",
    sendExternal: "发送系统通知",
  },
  api: {
    read: [{
      name: "list",
      signature: "list(): PulsarNotification[]",
      description: "列出内置通知，最新通知在前。",
      example: "notification.list()",
    }],
    sendInternal: [{
      name: "sendInternal",
      signature: "sendInternal(input: { title?: string; body?: string; level?: NotificationLevel }): Promise<PulsarNotification>",
      description: "将通知写入 Pulsar 内置通知中心。",
      example: "await notification.sendInternal({ title: '完成', body: '任务已完成' })",
    }],
    sendExternal: [{
      name: "sendExternal",
      signature: "sendExternal(input: { title?: string; body?: string }): Promise<boolean>",
      description: "请求系统通知权限并发送外部通知。",
      example: "await notification.sendExternal({ title: '完成' })",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    list: () => useNotificationStore().items.map((item) => ({ ...item })),
  } : {}),
  ...(granted.has("sendInternal") ? {
    sendInternal: (input: { title?: string; body?: string; level?: "info" | "success" | "warning" | "error" }) =>
      sendNotification({ ...input, channel: "internal" }),
  } : {}),
  ...(granted.has("sendExternal") ? {
    sendExternal: (input: { title?: string; body?: string }) =>
      sendNotification({ ...input, channel: "external" }),
  } : {}),
}));
