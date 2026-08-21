import {
  executeSandboxCodeAsync,
  resolveSandboxMessagesAsync,
  resolveSandboxTextAsync,
} from "@/features/Sandbox/sandbox";
import type { PluginFile } from "@/features/Plugin/tree/plugin-types";
import { binaryContent, resourceType, textContent, type PluginResource } from "./resource-types";
import { parsePluginChatContext } from "@/features/Plugin/editors/chat/plugin-chat";
import { createDataFacade, parsePluginDataDefinition } from "@/features/Plugin/editors/data/plugin-data";

export interface ResourceImportEnvironment extends Record<string, unknown> {
  imports?: (path: string) => Promise<unknown>;
}

function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

export function wrapResource(file: PluginFile): PluginResource {
  const type = resourceType(file);
  return {
    file,
    type,
    read: () => type === "media" ? binaryContent(file) : textContent(file),
    async import(environment: ResourceImportEnvironment) {
      const text = textContent(file);
      const logger = environment.logger as { append(message: string, depth?: number, type?: string, path?: string): void } | undefined;
      if (type === "markdown") return resolveSandboxTextAsync(text, [environment], { logger });
      if (type === "chat") {
        const parsed = parsePluginChatContext(text);
        const messages = parsed.message.filter((message) => message.enabled !== false);
        return resolveSandboxMessagesAsync(messages, [environment], { logger });
      }
      if (type === "data") {
        const definition = parsePluginDataDefinition(text);
        return createDataFacade(
          { name: file.name, wrapperSource: definition.wrapperSource },
          definition.initialValue,
          { readonly: true },
        );
      }
      if (type === "json") return parseJson(text);
      if (type === "javascript") return executeSandboxCodeAsync(text, [environment]);
      return type === "media" ? new TextEncoder().encode(text).buffer : text;
    },
  };
}
