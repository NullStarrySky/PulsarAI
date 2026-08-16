import type { ActionPart } from "../messages/conversation-types";
import {
  type ConversationRequestMode,
  useConversationStore,
} from "../store/conversation-store";

/**
 * `environment.conversation` 的完整实现。注册表按需屏蔽其中的危险方法。
 */
export function createConversationSandboxApi() {
  return {
    listPackages: () => {
      const store = useConversationStore();
      return store.packages.map(({ id, name, nickname, description, categoryId }) => ({
        id,
        name,
        nickname,
        description,
        categoryId,
      }));
    },
    listConversations: (packageId?: string) => {
      const store = useConversationStore();
      const target = packageId ?? store.activePackageId;
      return store.conversations
        .filter((item) => item.packageId === target)
        .map(({ id, packageId: ownerPackageId, kind, binding, title, rendererId, updatedAt }) => ({
          id,
          packageId: ownerPackageId,
          kind,
          binding,
          title,
          rendererId,
          updatedAt,
        }));
    },
    create: async (input?: {
      packageId?: string;
      kind?: "chat" | "test";
      binding?: {
        resourceType: string;
        resourceId: string;
        pluginId?: string;
      };
    }) => {
      const store = useConversationStore();
      const targetPackageId = input?.packageId ?? store.activePackageId;
      if (!store.packages.some((item) => item.id === targetPackageId)) {
        throw new Error("无法创建对话：角色包不存在。");
      }
      const created = await store.createConversation(targetPackageId, {
        kind: input?.kind,
        binding: input?.binding,
      });
      return {
        id: created.id,
        packageId: created.packageId,
        kind: created.kind,
        binding: created.binding,
        title: created.title,
        rendererId: created.rendererId,
        updatedAt: created.updatedAt,
      };
    },
    send: (content: string) => useConversationStore().send(content),
    pushErrorMessage: (content: string) =>
      useConversationStore().pushErrorMessage(content).then(() => undefined),
    requestContainer: async (input: {
      mode: ConversationRequestMode;
      containerId?: string;
      action?: ActionPart;
      prompt?: string;
      previousContainerId?: string;
    }) => {
      if (!input?.mode) {
        throw new Error("requestContainer 需要 mode。");
      }
      const container = await useConversationStore().requestContainer({
        mode: input.mode,
        containerId: input.containerId,
        prompt: input.prompt,
        previousContainerId: input.previousContainerId,
        ...(input.mode === "command" ? { action: input.action } : {}),
      });
      return container
        ? { id: container.id, role: container.role, command: container.command }
        : null;
    },
  };
}
