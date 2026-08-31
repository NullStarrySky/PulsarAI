import { describe, expect, it } from "vitest";
import {
  selectPluginSlotResources,
  type PluginSlot,
} from "@/features/Plugin/editors/slot/plugin-slot";
import {
  createWorldConfig,
  isWorldPathDisabled,
  selectWorldSlotPaths,
} from "@/features/Plugin/tree/world-config";

const singleSlot: PluginSlot = {
  id: "chat",
  title: "Chat",
  description: "",
  contentSuffixes: ["chat.json"],
  selectionMode: "single",
};
const resources = [
  { worldPath: "global/builtin-core-plugin/default.chat.json" },
  { worldPath: "self/default.chat.json" },
];

describe("Plugin slot selection", () => {
  it("keeps the first enabled resource for a single-choice slot", () => {
    expect(selectPluginSlotResources(
      singleSlot,
      [resources[1]!, resources[0]!],
    )).toEqual([resources[1]]);
  });

  it("keeps all resources for an unselected multi-choice slot", () => {
    expect(selectPluginSlotResources(
      { ...singleSlot, selectionMode: "multiple" },
      resources,
    )).toEqual(resources);
  });

  it("expands a disabled Plugin path when one single-choice export is enabled", () => {
    const config = createWorldConfig();
    config.disabled = ["/global/music"];
    const next = selectWorldSlotPaths(
      config,
      "chat",
      ["/global/music/a.chat.json", "/global/music/b.chat.json"],
      ["/global/music/a.chat.json", "/global/music/b.chat.json", "/global/music/readme.md"],
      ["/global/music/b.chat.json"],
    );

    expect(isWorldPathDisabled(next, "/global/music/b.chat.json")).toBe(false);
    expect(isWorldPathDisabled(next, "/global/music/a.chat.json")).toBe(true);
    expect(isWorldPathDisabled(next, "/global/music/readme.md")).toBe(true);
    expect(next.disabled).not.toContain("/global/music");
  });
});
