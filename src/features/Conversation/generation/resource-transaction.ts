import type {
  ChatMessage,
  ChatMessageMeta,
  ConversationResourceOperation,
} from "@/features/Conversation/messages/conversation-types";
import type { ContextDataDefinition, ContextDataValue } from "@/features/Plugin/editors/chat/plugin-chat";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";
import {
  createConversationDataApi,
  evaluateConversationData,
} from "@/features/Conversation/generation/conversation-memory";
import {
  appendConversationResourceOperations,
  safeClone,
} from "@/features/Conversation/store/conversation-resource-overlay";
import { parsePluginDataDefinition } from "@/features/Plugin/editors/data/plugin-data";

interface ResourceOverlayHandle {
  plugins: Plugin[];
  dataValues: Record<string, ContextDataValue>;
}

interface PluginEnvironmentHandle {
  enabledPlugins: Plugin[];
}

export interface ResourceTransactionDeps {
  resourceOverlay: ResourceOverlayHandle;
  pluginEnvironment: PluginEnvironmentHandle;
  finalEnvironment: SandboxEnvironment;
  emptyMessage: ChatMessage;
  onReplyChange?: () => void | Promise<void>;
}

export function createResourceTransactionCore(deps: ResourceTransactionDeps) {
  const { resourceOverlay, pluginEnvironment, finalEnvironment } = deps;

  const collectDataDefinitions = (): ContextDataDefinition[] => {
    const definitions: ContextDataDefinition[] = [];
    for (const plugin of pluginEnvironment.enabledPlugins) {
      for (const node of plugin.nodes) {
        if (node.kind === "file" && node.name.endsWith(".data.json")) {
          const parsed = parsePluginDataDefinition(node.content);
          const def = parsed.definition;
          definitions.push({
            id: node.id,
            name: node.name,
            dataId: node.id,
            resourceId: node.id,
            path: node.path,
            pluginId: plugin.id,
            pluginName: plugin.name,
            isolation: def.isolation,
            enableUpdater: def.enableUpdater,
            description: def.description,
            initialValue: def.initialValue,
            wrapperSource: def.wrapperSource,
            varName: def.varName,
          });
        }
      }
    }
    return definitions;
  };

  let dataDefinitions = collectDataDefinitions();
  let dataEvaluation = evaluateConversationData(
    dataDefinitions,
    resourceOverlay.dataValues,
    onDataReplace,
  );
  let transactionSnapshot: {
    plugins: Plugin[];
    dataValues: Record<string, ContextDataValue>;
    resourceUpdate: ChatMessageMeta["resourceUpdate"];
  } | null = null;
  let pendingOperations: ConversationResourceOperation[] = [];
  let resourceUpdateQueue = Promise.resolve();

  const recordResourceOperation = (operation: ConversationResourceOperation) => {
    if (transactionSnapshot) {
      pendingOperations.push(safeClone(operation));
    } else {
      deps.emptyMessage.meta.resourceUpdate = appendConversationResourceOperations(
        deps.emptyMessage.meta.resourceUpdate,
        [operation],
      );
      resourceUpdateQueue = resourceUpdateQueue.then(async () => {
        await deps.onReplyChange?.();
      });
    }
    refreshDataEnvironment();
    return resourceUpdateQueue;
  };

  function onDataReplace(
    definition: ContextDataDefinition,
    value: ContextDataValue,
  ) {
    resourceOverlay.dataValues[definition.id] = structuredClone(value);
    recordResourceOperation({
      type: "edit",
      target: {
        kind: "data",
        pluginId: definition.pluginId,
        resourceId: definition.id,
        dataId: definition.dataId,
        path: definition.path,
      },
      value: structuredClone(value),
    });
  }

  function refreshDataEnvironment() {
    dataDefinitions = collectDataDefinitions();
    dataEvaluation = evaluateConversationData(
      dataDefinitions,
      resourceOverlay.dataValues,
      onDataReplace,
    );
    finalEnvironment.variables = dataEvaluation.facades;
    finalEnvironment.VARIABLES = dataEvaluation.facades;
    finalEnvironment.dataFacades = Object.assign(
      {},
      dataEvaluation.facades,
      ...dataDefinitions.map((definition) => ({
        [definition.dataId]: dataEvaluation.facades[definition.id],
      })),
    );
    finalEnvironment.dataDefinitions = dataDefinitions;
    finalEnvironment.data = createConversationDataApi(
      dataDefinitions,
      dataEvaluation.state,
      onDataReplace,
    );
    finalEnvironment.DATA = finalEnvironment.data;
  }

  refreshDataEnvironment();

  return {
    recordResourceOperation,
    refresh: refreshDataEnvironment,
    transaction: {
      begin: () => {
        if (transactionSnapshot) throw new Error("资源 Overlay 事务不能嵌套。");
        transactionSnapshot = {
          plugins: safeClone(resourceOverlay.plugins),
          dataValues: safeClone(resourceOverlay.dataValues),
          resourceUpdate: safeClone(deps.emptyMessage.meta.resourceUpdate),
        };
        pendingOperations = [];
      },
      commit: async () => {
        deps.emptyMessage.meta.resourceUpdate = appendConversationResourceOperations(
          deps.emptyMessage.meta.resourceUpdate,
          pendingOperations,
        );
        transactionSnapshot = null;
        pendingOperations = [];
        refreshDataEnvironment();
        resourceUpdateQueue = resourceUpdateQueue.then(async () => {
          await deps.onReplyChange?.();
        });
        await resourceUpdateQueue;
      },
      rollback: () => {
        if (!transactionSnapshot) return;
        for (const plugin of resourceOverlay.plugins) {
          const snapshot = transactionSnapshot.plugins.find((item) => item.id === plugin.id);
          if (snapshot) Object.assign(plugin, safeClone(snapshot));
        }
        for (const key of Object.keys(resourceOverlay.dataValues)) {
          delete resourceOverlay.dataValues[key];
        }
        Object.assign(resourceOverlay.dataValues, safeClone(transactionSnapshot.dataValues));
        deps.emptyMessage.meta.resourceUpdate = safeClone(transactionSnapshot.resourceUpdate);
        transactionSnapshot = null;
        pendingOperations = [];
        refreshDataEnvironment();
      },
    },
    dataState: () => dataEvaluation.state,
    dataDefinitions: () => dataDefinitions,
    queue: () => resourceUpdateQueue,
  };
}
