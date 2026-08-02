export type Role = "assistant" | "user" | "system";
export type ChatMessageType = "message" | "error";
export type ConversationReasoningEffort =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export interface CharacterPackageConversationLink {
  id: string;
  lastContainerid: string;
  title: string;
}

export interface CharacterPackage {
  id: string;
  name: string;
  icon: string;
  description?: string;
  categoryId?: string | null;
  order: number;
  conversations: CharacterPackageConversationLink[];
  /** The package-owned resource plugin. Exactly one plugin may own this package. */
  pluginId: string;
  /** The enabled plugin that owns both context.md and the selected generation process. */
  mainPluginId: string;
  /** Package-local activation set for optional global plugins. Ordering is not semantic. */
  enabledGlobalPluginIds: string[];
  capabilities?: CapabilityGrants;
  syncEnabled?: boolean;
}

export interface PackageCategory {
  id: string;
  name: string;
  order: number;
}

export type ConversationRendererId = "chat" | "novel";

export type ConversationKind = "chat" | "task" | "test";

export interface ConversationResourceBinding {
  packageId?: string;
  resourceType: string;
  resourceId: string;
  resourcePath: string;
  resourceTitle: string;
  pluginId?: string;
}

export interface Conversation {
  id: string;
  packageId: string;
  kind: ConversationKind;
  binding?: ConversationResourceBinding;
  title: string;
  isTemplate?: boolean;
  rendererId?: ConversationRendererId;
  reasoningEffort: ConversationReasoningEffort;
  featureApiEnabled: boolean;
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

export interface LocalStep {
  name: string;
  message: string;
}

export interface SubAgentStep {
  type: "sub-agent";
  name: string;
  status: "pending" | "running" | "done" | "failed";
  message?: string;
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

export interface ConversationVariableUpdate {
  intent: "variable-update";
  source: string;
  sourceHash: string;
  sources?: string[];
  definitionHash: string;
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
  variableUpdate?: ConversationVariableUpdate;
  steps: (LocalStep | ToolCallResult | SubAgentStep)[];
};

export type ChatMessage = {
  id: string;
  type: ChatMessageType;
  content: string;
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
};

export type MessageDraftClosure = (message: ChatMessage, container: ChatMessageContainer) => void | Promise<void>;
import type { CapabilityGrants } from "@/features/Capabilities/domain/capability";
