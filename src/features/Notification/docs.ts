import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "notification",
  title: "通知",
  description: "发送系统外部通知或写入 Pulsar 内置通知中心。",
  documentation: {
    overview: "统一处理应用内通知记录与操作系统通知。internal 通道持久化到内置通知中心，external 通道会先请求系统权限。",
    notes: [
      "外部通知是默认投递方式，但不会自动复制一份到内置通知中心。",
      "读取只返回通知元数据和正文，不会改变 read 状态。",
    ],
    types: [
      {
        name: "NotificationLevel",
        description: "内置通知使用的语义级别。",
        definition: `type NotificationLevel =
  | "info"
  | "success"
  | "warning"
  | "error";`,
      },
      {
        name: "PulsarNotification",
        description: "内置通知中心保存的通知记录。",
        definition: `interface PulsarNotification {
  id: string;
  title: string;
  body: string;
  level: NotificationLevel;
  createdAt: string;
  read: boolean;
}`,
      },
    ],
  },
  api: [
    {
      name: "list",
      signature: "list(): PulsarNotification[]",
      description: "列出内置通知，最新通知在前。",
      example: "notification.list()",
    },
    {
      name: "sendInternal",
      signature: "sendInternal(input: { title?: string; body?: string; level?: NotificationLevel }): Promise<PulsarNotification>",
      description: "将通知写入 Pulsar 内置通知中心。",
      example: "await notification.sendInternal({ title: '完成', body: '任务已完成' })",
    },
    {
      name: "sendExternal",
      signature: "sendExternal(input: { title?: string; body?: string }): Promise<boolean>",
      description: "请求系统通知权限并发送外部通知。",
      example: "await notification.sendExternal({ title: '完成' })",
    },
  ],
};
