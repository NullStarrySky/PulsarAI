import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.hoisted(() => {
  Object.assign(globalThis, {
    window: { pulsarHost: { invoke: async () => null, listen: async () => () => {} } },
  });
});

import { createPluginSelfApi } from "@/features/Plugin/runtime/self-api";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";

function createMockPlugin(id: string, files: Array<{ path: string; content: unknown; insertion?: any }>): Plugin {
  return {
    id,
    packageId: "pkg-1",
    name: id,
    icon: "",
    shortDescription: "",
    nodes: files.map((f) => ({
      id: `${id}:${f.path}`,
      kind: "file",
      name: f.path.split("/").pop()!,
      path: f.path,
      icon: "",
      treeOrder: 0,
      content: f.content,
      order: 100,
      insertion: f.insertion,
    })),
    enabled: true,
    builtIn: false,
  };
}

describe("Simplified Runtime importResource", () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  it("imports and evaluates markdown macros via sandbox natively", async () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "greeting.md", content: "Hello {{ name }}!" },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });
    const result = await api.import("greeting.md", { name: "Pulsar" });
    expect(result).toBe("Hello Pulsar!");
  });

  it("imports and compiles chat context with resolveSandboxMessages", async () => {
    const chatDoc = {
      message: [
        { role: "system", content: "System: {{ systemPrompt }}" },
        { role: "user", content: "User: {{ userInput }}" },
      ],
    };
    const plugin = createMockPlugin("test-plugin", [
      { path: "prompt.chat.json", content: chatDoc },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });
    const result = (await api.import("prompt.chat.json", {
      systemPrompt: "Be helpful",
      userInput: "Hi",
    })) as any;

    expect(result).toEqual([
      { role: "system", content: "System: Be helpful" },
      { role: "user", content: "User: Hi" },
    ]);
  });

  it("handles condition checks on import", async () => {
    const plugin = createMockPlugin("test-plugin", [
      {
        path: "conditional.md",
        content: "Feature Enabled",
        insertion: { condition: "featureActive === true" },
      },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });

    const passResult = await api.import("conditional.md", { featureActive: true });
    expect(passResult).toBe("Feature Enabled");

    const failResult = await api.import("conditional.md", { featureActive: false });
    expect(failResult).toBeNull();
  });

  it("reads wrapped content by default and raw content with noWrapper", async () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "conditional.md", content: "Hello {{ name }}", insertion: { condition: "false" } },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });

    await expect(api.read("conditional.md", { environment: { name: "Pulsar" } })).resolves.toBe("Hello Pulsar");
    await expect(api.read("conditional.md", { noWrapper: true })).resolves.toBe("Hello {{ name }}");
  });

  it("resolves one extensionless file path and rejects ambiguity", async () => {
    const api = createPluginSelfApi("test-plugin", {
      plugins: [createMockPlugin("test-plugin", [
        { path: "notes/greeting.md", content: "hello" },
        { path: "notes/duplicate.txt", content: "one" },
        { path: "notes/duplicate.md", content: "two" },
      ])],
    });

    await expect(api.read("notes/greeting", { noWrapper: true })).resolves.toBe("hello");
    await expect(api.read("notes/duplicate", { noWrapper: true })).rejects.toThrow("无后缀路径不唯一");
  });

  it("opens, closes, and toggles Plugin panels or resource editors", () => {
    const plugin = createMockPlugin("test-plugin", [{ path: "notes.md", content: "hello" }]);
    const store = usePluginStore();
    store.plugins = [plugin];
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });

    expect(api.open("@/")).toMatchObject({ open: true, kind: "panel", pluginId: "test-plugin" });
    expect(store.assetPanelPluginId).toBe("test-plugin");
    expect(api.toggle("@/")).toMatchObject({ open: false, kind: "panel" });
    expect(api.open("@/notes.md")).toMatchObject({ open: true, kind: "resource", path: "notes.md" });
    expect(store.activeEditorState?.file.path).toBe("notes.md");
    expect(api.close("@/notes.md")).toMatchObject({ open: false, kind: "resource" });
  });
});
