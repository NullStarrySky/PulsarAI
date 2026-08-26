import { describe, expect, it } from "vitest";
import {
  findPluginNodeByPath,
  pluginChildNodes,
  pluginDirectoryExists,
  type Plugin,
} from "@/features/Plugin/tree/plugin-types";
import { ConversationResourceOverlay } from "@/features/Conversation/messages/conversation-resource-overlay";

function plugin(): Plugin {
  return {
    id: "flat-plugin",
    packageId: "package",
    name: "Flat",
    icon: "",
    shortDescription: "",
    enabled: true,
    builtIn: false,
    files: [
      {
        id: "profile",
        path: "character/alice/profile.md",
        name: "profile.md",
        icon: "",
        treeOrder: 0,
        kind: "file",
        content: "Alice",
        order: 100,
      },
    ],
    emptyFolders: ["instruction/drafts"],
  };
}

describe("Plugin flat file tree", () => {
  it("infers every non-empty intermediate directory", () => {
    const value = plugin();

    expect(pluginDirectoryExists(value, "character")).toBe(true);
    expect(pluginDirectoryExists(value, "character/alice")).toBe(true);
    expect(findPluginNodeByPath(value, "instruction/drafts")).toMatchObject({
      kind: "folder",
      path: "instruction/drafts",
    });
    expect(pluginChildNodes(value, "").map((node) => node.path)).toEqual([
      "character",
      "instruction",
    ]);
  });

  it("preserves the parent as empty after its last file is removed", () => {
    const overlay = new ConversationResourceOverlay({
      plugins: [plugin()],
      activePath: [],
    });

    overlay.remove("flat-plugin", "character/alice/profile.md");

    const value = overlay.plugins[0]!;
    expect(value.files).toHaveLength(0);
    expect(value.emptyFolders).toContain("character/alice");
    expect(pluginDirectoryExists(value, "character")).toBe(true);
  });

  it("moves an empty directory without materializing folder nodes", () => {
    const value = plugin();
    const overlay = new ConversationResourceOverlay({
      plugins: [value],
      activePath: [],
    });

    overlay.mkdir("flat-plugin", "archive");
    overlay.move("flat-plugin", "instruction/drafts", "archive/drafts");

    const moved = overlay.plugins[0]!;
    expect(moved.emptyFolders).toContain("archive/drafts");
    expect(moved.emptyFolders).not.toContain("instruction/drafts");
    expect(pluginDirectoryExists(moved, "instruction")).toBe(true);
  });
});
