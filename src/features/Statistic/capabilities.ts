import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useStatisticStore } from "./application/statistic-store";

export const capabilities: CapabilityDefinition = {
  id: "statistic",
  title: "统计",
  description: "读取不含消息正文的本地使用统计。",
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
