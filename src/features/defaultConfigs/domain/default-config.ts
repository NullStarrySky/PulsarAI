import type { CapabilityGrants } from "@/features/Capabilities/domain/capability";
import { fallbackCapabilityGrants } from "@/features/Capabilities/domain/default-grants";

export interface DefaultConfigs {
  defaultChatModel: string;
  fastModel: string;
  embeddingModel: string;
  imageModel: string;
  defaultCapabilities: CapabilityGrants;
}

export const defaultConfigKeys = {
  defaultChatModel: "defaultChatModel",
  fastModel: "fastModel",
  embeddingModel: "embeddingModel",
  imageModel: "imageModel",
  defaultCapabilities: "defaultCapabilities",
} as const;

export const fallbackDefaultConfigs: DefaultConfigs = {
  defaultChatModel: "openai/gpt-4o-mini",
  fastModel: "openai/gpt-4o-mini",
  embeddingModel: "",
  imageModel: "",
  defaultCapabilities: fallbackCapabilityGrants,
};
