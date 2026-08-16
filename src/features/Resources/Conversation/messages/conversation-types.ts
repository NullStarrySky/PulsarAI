export type Role = "assistant" | "user" | "system";
export type ChatMessageType = "message" | "error";

export function formatChatMessageError(content: unknown) {
  const message = content instanceof Error ? content.message : String(content ?? "生成失败");
  const normalized = message.trim() || "生成失败";
  return normalized.startsWith("[ERROR]") ? normalized : `[ERROR] ${normalized}`;
}

export interface CharacterPackageConversationLink {
  id: string;
  lastContainerid: string;
  title: string;
}

export interface CharacterPackage {
  id: string;
  name: string;
  /** Stable source-facing alias such as an imported character-card filename. */
  nickname?: string;
  icon: string;
  description?: string;
  categoryId?: string | null;
  order: number;
  pinned?: boolean;
  conversations: CharacterPackageConversationLink[];
  /** The package-owned resource plugin. Exactly one plugin may own this package. */
  pluginId: string;
  /** The enabled plugin whose manifest owns the selected generatePath. */
  mainPluginId: string;
  /** Package-local activation set for optional global plugins. Ordering is not semantic. */
  enabledGlobalPluginIds: string[];
  syncEnabled?: boolean;
}

export interface PackageCategory {
  id: string;
  name: string;
  order: number;
}

export type ConversationRendererId = "chat" | "novel";

export type ConversationKind = "chat" | "test";

export interface ConversationResourceBinding {
  packageId?: string;
  resourceType: string;
  resourceId: string;
  resourcePath?: string;
  resourceTitle?: string;
  pluginId?: string;
}

export interface Conversation {
  id: string;
  packageId: string;
  kind: ConversationKind;
  binding?: ConversationResourceBinding;
  title: string;
  pinned?: boolean;
  isTemplate?: boolean;
  isEphemeral?: boolean;
  rendererId?: ConversationRendererId;
  rootContainerId: string | null;
  lastContainerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ToolCallResult {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
}

export interface ToolCallStep {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface ThinkingStep {
  type: "thinking";
  id: string;
  message: string;
}

export type DataContent = string | Uint8Array | ArrayBuffer;

export interface TextPart {
  type: "text";
  text: string;
}

export interface ImagePart {
  type: "image";
  image: DataContent | URL;
  mediaType?: string;
}

export interface FilePart {
  type: "file";
  data: DataContent | URL;
  filename?: string;
  mediaType: string;
  size?: number;
}

export interface ComponentPart {
  type: "component";
  componentId: string;
  props?: Record<string, unknown>;
}

export interface ActionPart {
  type: "action";
  actionId: string;
  pluginId: string;
  pluginName: string;
  name: string;
  description: string;
}

export type AdditionalParts = TextPart | ImagePart | FilePart | ComponentPart | ActionPart;

export interface ConversationResourceNodeSnapshot {
  id: string;
  name: string;
  icon: string;
  treeOrder: number;
  kind: "file" | "folder";
  content?: unknown;
  order?: number;
  insertion?: {
    target: string;
    condition?: string;
    conditionPath?: string;
  };
  children?: ConversationResourceNodeSnapshot[];
}

export type ConversationResourceOperation =
  | {
      type: "edit";
      target: {
        kind: "plugin-node";
        pluginId: string;
        resourceId: string;
      };
      value: ConversationResourceNodeSnapshot;
    }
  | {
      type: "edit";
      target: {
        kind: "data";
        pluginId: string;
        resourceId: string;
        dataId: string;
        path: string;
      };
      value: unknown;
    }
  | {
      type: "create";
      pluginId: string;
      parentId: string;
      node: ConversationResourceNodeSnapshot;
    }
  | {
      type: "move";
      pluginId: string;
      resourceId: string;
      targetPluginId: string;
      parentId: string;
      name: string;
    }
  | {
      type: "remove";
      target: {
        kind: "plugin-node";
        pluginId: string;
        resourceId: string;
      };
    };

export interface ConversationResourceUpdate {
  operations: ConversationResourceOperation[];
  createdAt: string;
}

export type ChatMessageMeta = {
  translation?: {
    originalContent: string;
    translatedAt: string;
  };
  generateInfo?: {
    modelName: string;
    startTime: string;
    timeUsed?: number;
  };
  environmentInfo?: {
    pluginId: string;
    pluginName: string;
    characterId: string;
    characterName: string;
    resolvedResourceIds?: string[];
    diagnostics?: string[];
  };
  /** Ordered resource overlay operations produced by this concrete message version. */
  resourceUpdate?: ConversationResourceUpdate;
  /** Only Agent reasoning and model tool calls are persisted here. */
  steps: (ThinkingStep | ToolCallStep | ToolCallResult)[];
};

export type ChatMessage = {
  id: string;
  type: ChatMessageType;
  content: string;
  createdAt: string;
  favorite?: boolean;
  meta: ChatMessageMeta;
  parts?: AdditionalParts[];
};

export type ChatMessageContainer = {
  id: string;
  role: Role;
  conversationid: string;
  content: ChatMessage[];
  activeMessage: number | null;
  availableNextContainer: string[];
  activeNextContainer: string | null;
  previousContainer: string | null;
  /** Command runs are persisted in the causal path but omitted from normal chat context. */
  hidden?: boolean;
  /** Auditable invocation metadata for a hidden command-generation container. */
  command?: {
    name: string;
    args: string;
  };
  /** Command-local Markdown scratchpad, exposed to its process as ctx.draft. */
  draft?: string;
};

export type MessageDraftClosure = (message: ChatMessage, container: ChatMessageContainer) => void | Promise<void>;
