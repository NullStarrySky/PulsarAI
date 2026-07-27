import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useConversationStore } from "./application/conversation-store";

export const capabilities: CapabilityDefinition = {
  id: "conversation",
  title: "对话",
  description: "查询角色包和对话，创建对话，或向当前对话发送消息。",
  subCaps: {
    all: "全部对话权限",
    read: "读取角色包与对话",
    create: "创建对话",
    send: "发送消息并生成回复",
  },
  api: {
    read: [
      {
        name: "listPackages",
        signature: "listPackages(): CharacterPackageSummary[]",
        description: "列出角色包的 id、名称与说明。",
        example: "conversation.listPackages()",
      },
      {
        name: "listConversations",
        signature: "listConversations(packageId?: string): ConversationSummary[]",
        description: "列出指定角色包或当前角色包中的对话。",
        example: "conversation.listConversations()",
      },
    ],
    create: [{
      name: "create",
      signature: "create(packageId?: string): Promise<ConversationSummary>",
      description: "在指定角色包或当前角色包中新建并打开一个对话。",
      example: "await conversation.create()",
    }],
    send: [{
      name: "send",
      signature: "send(content: string): Promise<void>",
      description: "向当前对话发送文本，并运行正常的插件与 Agent 生成流程。",
      example: "await conversation.send('继续')",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    listPackages: () => {
      const store = useConversationStore();
      return store.packages.map(({ id, name, description, categoryId }) => ({
        id,
        name,
        description,
        categoryId,
      }));
    },
    listConversations: (packageId?: string) => {
      const store = useConversationStore();
      const target = packageId ?? store.activePackageId;
      return store.conversations
        .filter((item) => item.packageId === target)
        .map(({ id, packageId: ownerPackageId, title, rendererId, updatedAt }) => ({
          id,
          packageId: ownerPackageId,
          title,
          rendererId,
          updatedAt,
        }));
    },
  } : {}),
  ...(granted.has("create") ? {
    create: async (packageId?: string) => {
      const store = useConversationStore();
      const targetPackageId = packageId ?? store.activePackageId;
      if (!store.packages.some((item) => item.id === targetPackageId)) {
        throw new Error("无法创建对话：角色包不存在。");
      }
      const created = await store.createConversation(packageId);
      return {
        id: created.id,
        packageId: created.packageId,
        title: created.title,
        rendererId: created.rendererId,
        updatedAt: created.updatedAt,
      };
    },
  } : {}),
  ...(granted.has("send") ? {
    send: (content: string) => useConversationStore().send(content),
  } : {}),
}));
