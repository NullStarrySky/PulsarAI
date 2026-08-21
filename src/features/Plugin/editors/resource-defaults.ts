import { createPluginChatContext } from "./chat/plugin-chat";
import { createPluginDataDefinition } from "./data/plugin-data";
import { createPluginMediaContent } from "./media/plugin-media";
import type { PluginFileType } from "@/features/Plugin/tree/plugin-types";

export function createPluginResourceContent(type: PluginFileType): unknown {
  if (type === "chat") return createPluginChatContext();
  if (type === "data") return createPluginDataDefinition();
  if (type === "media") return createPluginMediaContent("");
  if (type === "component") return "<template>\n  <div />\n</template>\n";
  if (type === "json") return {};
  return "";
}
