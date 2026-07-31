import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useStatisticStore } from "./application/statistic-store";

export const capabilities: CapabilityDefinition = {
  id: "statistic",
  title: "统计",
  description: "读取不含消息正文的本地使用统计。",
  documentation: {
    overview: "提供本地资源规模的聚合视图，用于展示存储占用和消息数量。统计结果不包含消息文本、附件内容或模型凭据。",
    notes: [
      "首次调用会初始化统计存储并读取最新聚合值。",
      "sizeByType 与 sizeByPackage 的单位由统计存储统一维护，调用方不应自行混用其他单位。",
    ],
    types: [
      {
        name: "StatisticSizeEntry",
        description: "一个资源类型或角色包的存储占用条目。",
        definition: `interface StatisticSizeEntry {
  id: string;
  label: string;
  bytes: number;
  color: string;
}`,
      },
      {
        name: "StatisticSummary",
        description: "公开的本地使用统计摘要。",
        definition: `interface StatisticSummary {
  messageCount: number;
  sizeByType: StatisticSizeEntry[];
  sizeByPackage: StatisticSizeEntry[];
}`,
      },
    ],
  },
  subCaps: {
    all: "全部统计权限",
    read: "读取统计",
  },
  api: {
    read: [{
      name: "summary",
      signature: "summary(): Promise<StatisticSummary>",
      description: "返回消息数量及按资源类型、角色包聚合的存储大小。",
      example: "await statistic.summary()",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    summary: async () => {
      const store = useStatisticStore();
      await store.initialize();
      return {
        messageCount: store.messageCount,
        sizeByType: store.sizeByType,
        sizeByPackage: store.sizeByPackage,
      };
    },
  } : {}),
}));
