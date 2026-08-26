import type { ModelMessage } from "ai";
import { PluginLogger } from "@/features/Plugin/runtime";
import type { ResourceImportEnvironment } from "@/features/Plugin/resources/resource-wrapper";
import {
  type PluginStoreApiMutation,
  usePluginStore,
} from "@/features/Plugin/tree/plugin-store";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";
import { useSlotStore } from "@/features/Plugin/tree/slot-store";
import {
  resolveSandboxMessagesAsync,
  resolveSandboxTextAsync,
} from "@/features/Sandbox/sandbox";

export type PluginSelfApiMutation = PluginStoreApiMutation;

export interface PluginSelfApiOptions {
  plugins?: Plugin[];
  logger?: PluginLogger;
  mutation?: PluginSelfApiMutation;
  conversationId?: string;
}

function isModelMessage(value: unknown): value is ModelMessage {
  return Boolean(value && typeof value === "object" && "role" in value && "content" in value);
}

/** Compose the Store-owned Plugin and Slot APIs with recursive Sandbox parsing. */
export function createPluginSelfApi(
  pluginId: string,
  options: PluginSelfApiOptions = {},
) {
  const logger = options.logger ?? new PluginLogger();
  const plugins = options.plugins ?? usePluginStore().plugins;
  const plugin = usePluginStore().api(pluginId, { ...options, plugins, logger });
  const slot = useSlotStore().api(plugins);
  const parse = async (
    path: string | string[],
    input: ResourceImportEnvironment = {},
  ) => {
    const environment: ResourceImportEnvironment = {
      ...input,
      imports: input.imports ?? plugin.import,
      logger,
    };
    const imported = await plugin.import(path, environment);
    if (typeof imported === "string") {
      return resolveSandboxTextAsync(imported, [environment], { logger });
    }
    if (Array.isArray(imported) && imported.every(isModelMessage)) {
      return resolveSandboxMessagesAsync(imported, [environment], { logger });
    }
    return imported;
  };
  return { ...plugin, parse, slot, logger };
}
