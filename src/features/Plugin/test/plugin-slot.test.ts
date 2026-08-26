import { describe, expect, it } from "vitest";
import {
  selectPluginSlotResources,
  type PluginSlot,
} from "@/features/Plugin/editors/slot/plugin-slot";

const singleSlot: PluginSlot = {
  id: "chat",
  title: "Chat",
  scope: "global",
  description: "",
  contentSuffixes: ["chat.json"],
  selectionMode: "single",
};
const resources = [
  { pluginId: "builtin-core-plugin", path: "default.chat.json" },
  { pluginId: "character-plugin", path: "default.chat.json" },
];

describe("Plugin slot selection", () => {
  it("selects a Plugin-relative resource and keeps one single-choice result", () => {
    expect(selectPluginSlotResources(
      singleSlot,
      resources,
      ["default.chat.json"],
      "character-plugin",
    )).toEqual([resources[1]]);
  });

  it("keeps all resources for an unselected multi-choice slot", () => {
    expect(selectPluginSlotResources(
      { ...singleSlot, selectionMode: "multiple" },
      resources,
      undefined,
    )).toEqual(resources);
  });
});
