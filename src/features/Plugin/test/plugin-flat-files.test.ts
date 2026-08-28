import { describe, expect, it } from "vitest";
import {
  findPluginNodeByPath,
  pluginChildNodes,
  pluginDirectoryExists,
  type Plugin,
} from "@/features/Plugin/tree/plugin-types";

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

});
