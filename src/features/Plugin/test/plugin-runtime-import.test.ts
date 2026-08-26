import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.hoisted(() => {
  Object.assign(globalThis, {
    window: {
      pulsarHost: { invoke: async () => null, listen: async () => () => {} },
    },
  });
});

import { createPluginSelfApi } from "@/features/Plugin/runtime/self-api";
import {
  buildPluginGenerationEnvironment,
  previewPluginResource,
} from "@/features/Plugin/runtime/environment";
import { createBuiltinPlugins } from "@/features/Plugin/tree/builtin-plugins";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";

function createMockPlugin(
  id: string,
  files: Array<{ path: string; content: unknown; insertion?: any }>,
): Plugin {
  return {
    id,
    packageId: "pkg-1",
    name: id,
    icon: "",
    shortDescription: "",
    files: files.map((f) => ({
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
    emptyFolders: [],
    enabled: true,
    builtIn: false,
  };
}

describe("Simplified Runtime importResource", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });
  it("imports a wrapped markdown resource synchronously without resolving its macros", () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "greeting.md", content: "Hello {{ name }}!" },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });
    const result = api.import("greeting.md", { name: "Pulsar" });
    expect(result).toBe("Hello {{ name }}!");
  });

  it("keeps Plugin import shallow and parses selected resources recursively", async () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "prompt.md", content: "Hello {{ name }}" },
      {
        path: "context.md",
        content: 'Context: {{ await imports("@/prompt.md") }}',
      },
      { path: "root.md", content: 'Root: {{ await imports("@/context.md") }}' },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });
    const raw = await api.import("root.md");
    expect(raw).toBe('Root: {{ await imports("@test-plugin/context.md") }}');
    await expect(api.parse("root.md", { name: "Pulsar" }))
      .resolves.toBe("Root: Context: Hello Pulsar");
  });

  it("previews an unsaved resource snapshot through the recursive Sandbox resolver", async () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "detail.md", content: "from saved resource" },
      { path: "root.md", content: "saved" },
    ]);
    const file = plugin.files.find((item) => item.path === "root.md")!;

    const preview = await previewPluginResource({
      plugin,
      file,
      plugins: [plugin],
      content: 'Root: {{ await imports("@/detail.md") }}',
    });

    expect(preview.error).toBeUndefined();
    expect(preview.value).toBe("Root: from saved resource");
    expect(preview.logger.toFormattedText()).toContain("宏展开第 1 轮");
  });

  it("accepts slot path arrays directly and flattens their wrapped resources", async () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "one.md", content: "one", insertion: { slot: "document" } },
      { path: "two.md", content: "two", insertion: { slot: "document" } },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });
    const paths = api.slot.paths("document", "global");

    expect(api.slot.import("document", "global")).toEqual(paths);
    expect(api.import(paths)).toEqual(["one", "two"]);
  });

  it("keeps @/ imports scoped to each document's owning Plugin", async () => {
    const first = createMockPlugin("plugin-a", [
      {
        path: "slots.json",
        content: {
          slots: [
            {
              id: "multi-plugin-context",
              title: "Context",
              scope: "global",
              contentSuffixes: ["chat.json"],
              selectionMode: "none",
            },
          ],
        },
      },
      {
        path: "context.chat.json",
        content: {
          message: [
            { role: "system", content: '{{ await imports("@/detail.md") }}' },
          ],
        },
        insertion: { slot: "multi-plugin-context" },
      },
      { path: "detail.md", content: "from A" },
    ]);
    const second = createMockPlugin("plugin-b", [
      {
        path: "context.chat.json",
        content: {
          message: [
            { role: "system", content: '{{ await imports("@/detail.md") }}' },
          ],
        },
        insertion: { slot: "multi-plugin-context" },
      },
      { path: "detail.md", content: "from B" },
    ]);
    const api = createPluginSelfApi(first.id, { plugins: [first, second] });
    const paths = api.slot.paths("multi-plugin-context", "global");

    expect(paths).toEqual([
      "@plugin-a/context.chat.json",
      "@plugin-b/context.chat.json",
    ]);
    const messages = await api.parse(paths);
    expect(messages).toEqual([
      { role: "system", content: "from A" },
      { role: "system", content: "from B" },
    ]);
    const readDocument = JSON.parse(
      api.read("@plugin-b/context.chat.json") as string,
    );
    expect(readDocument.message[0].content).toContain(
      'imports("@plugin-b/detail.md")',
    );
  });

  it("reports a recursive resource cycle from Sandbox rather than Plugin import", async () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "one.md", content: '{{ await imports("@/two.md") }}' },
      { path: "two.md", content: '{{ await imports("@/one.md") }}' },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });
    await expect(api.parse("one.md")).resolves.toContain('imports("@test-plugin/two.md")');
    expect(api.logger.logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining("检测到宏展开循环"), type: "error" }),
    ]));
  });

  it("keeps the built-in core context on Sandbox imports rather than module import", async () => {
    const core = createBuiltinPlugins().find(
      (plugin) => plugin.id === "builtin-core-plugin",
    )!;
    const api = createPluginSelfApi(core.id, { plugins: [core] });
    const context = await api.parse("default.chat.json", {
      chat: [{ role: "user", content: "当前请求" }],
    });
    const generate = api.read("generate.js");

    expect(generate).toContain('imports("@builtin-core-plugin/config.json")');
    expect(generate).toContain('imports(slot.paths("CTX_BUILD", "global"))');
    expect(api.slot.paths("chat", "global")).toEqual([
      "@builtin-core-plugin/default.chat.json",
    ]);
    expect(api.slot.import("chat", "global")).toEqual(
      api.slot.paths("chat", "global"),
    );
    expect(context).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "system",
          content: expect.stringContaining("Use the single codeAct tool"),
        }),
        { role: "user", content: "当前请求" },
      ]),
    );
  });

  it("exposes the Plugin resolver as the generation Sandbox imports capability", async () => {
    const plugin = createMockPlugin("test-plugin", [
      {
        path: "generate.js",
        content: "return undefined;",
        insertion: { slot: "generatePath" },
      },
    ]);
    const generation = await buildPluginGenerationEnvironment([plugin], {
      activePath: [],
      chat: [],
      conversationId: "chat",
      conversation: { id: "chat" },
      packageId: "pkg-1",
      mainPluginId: plugin.id,
      containerId: "reply",
      prompt: "",
    });

    expect(generation.environment.imports).toBe(generation.selfApi.import);
    expect(generation.environment.parse).toEqual(expect.any(Function));
    const readDocs = generation.environment.read_docs as (
      id?: string,
    ) => string[] | string | null;
    expect(readDocs()).toEqual(["package", "plugin", "conversation"]);
    expect(readDocs("plugin")).toContain("# Plugin 资源");
    expect(readDocs("missing")).toBeNull();
  });

  it("imports pure chat messages and parses the selected resource", async () => {
    const chatDoc = {
      message: [
        { role: "system", content: "System: {{ systemPrompt }}", name: "instruction" },
        { role: "user", content: "User: {{ userInput }}", enabled: false },
      ],
    };
    const plugin = createMockPlugin("test-plugin", [
      { path: "prompt.chat.json", content: chatDoc },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });
    expect(api.import("prompt.chat.json")).toEqual([
      { role: "system", content: "System: {{ systemPrompt }}" },
    ]);
    const result = await api.parse("prompt.chat.json", {
      systemPrompt: "Be helpful",
      userInput: "Hi",
    });

    expect(result).toEqual([
      { role: "system", content: "System: Be helpful" },
    ]);
  });

  it("registers an enabled root regex.json in the ordered REGEX slot", () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "regex.json", content: [] },
    ]);
    const api = createPluginSelfApi(plugin.id, { plugins: [plugin] });

    expect(api.slot.paths("REGEX", "global")).toEqual([
      "@test-plugin/regex.json",
    ]);
    plugin.enabled = false;
    expect(api.slot.paths("REGEX", "global")).toEqual([]);
  });

  it("keeps data injection and prompt descriptions in separate slots", () => {
    const core = createBuiltinPlugins().find(
      (plugin) => plugin.id === "builtin-core-plugin",
    )!;
    const api = createPluginSelfApi(core.id, { plugins: [core] });

    expect(api.slot.get("DATA", "global")).toBeNull();
    expect(api.slot.get("DATA_INJECT", "global")).toMatchObject({
      contentSuffixes: ["data.json"],
    });
    expect(api.slot.get("data_prompt", "global")).toMatchObject({
      contentSuffixes: ["chat.json"],
    });
  });

  it("handles condition checks synchronously on import", () => {
    const plugin = createMockPlugin("test-plugin", [
      {
        path: "conditional.md",
        content: "Feature Enabled",
        insertion: { condition: "featureActive === true" },
      },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });

    const passResult = api.import("conditional.md", { featureActive: true });
    expect(passResult).toBe("Feature Enabled");

    const failResult = api.import("conditional.md", { featureActive: false });
    expect(failResult).toBeNull();
  });

  it("reads raw resource content synchronously", () => {
    const plugin = createMockPlugin("test-plugin", [
      {
        path: "conditional.md",
        content: "Hello {{ name }}",
        insertion: { condition: "false" },
      },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });

    expect(api.read("conditional.md")).toBe("Hello {{ name }}");
  });

  it("resolves one extensionless file path and rejects ambiguity synchronously", () => {
    const api = createPluginSelfApi("test-plugin", {
      plugins: [
        createMockPlugin("test-plugin", [
          { path: "notes/greeting.md", content: "hello" },
          { path: "notes/duplicate.txt", content: "one" },
          { path: "notes/duplicate.md", content: "two" },
        ]),
      ],
    });

    expect(api.read("notes/greeting")).toBe("hello");
    expect(() => api.read("notes/duplicate")).toThrow("无后缀路径不唯一");
  });

  it("applies Overlay mutations synchronously", () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "note.md", content: "before" },
    ]);
    const api = createPluginSelfApi("test-plugin", {
      plugins: [plugin],
      mutation: {
        writeFile: (_pluginId, path, content) => {
          const file = plugin.files.find((node) => node.path === path);
          if (file?.kind === "file") file.content = content;
        },
        editFile: () => {},
        mkdir: () => {},
        move: () => {},
        remove: () => {},
      },
    });

    expect(api.write("note.md", "after")).toBeUndefined();
    expect(api.read("note.md")).toBe("after");
  });

  it("updates the in-memory Plugin before background persistence completes", () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "note.md", content: "before" },
    ]);
    const store = usePluginStore();
    store.plugins = [plugin];
    const api = createPluginSelfApi("test-plugin");

    expect(api.write("note.md", "after")).toBeUndefined();
    expect(api.read("note.md")).toBe("after");
  });

  it("opens, closes, and toggles Plugin panels or resource editors", () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "notes.md", content: "hello" },
    ]);
    const store = usePluginStore();
    store.plugins = [plugin];
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });

    expect(api.open("@/")).toMatchObject({
      open: true,
      kind: "panel",
      pluginId: "test-plugin",
    });
    expect(store.assetPanelPluginId).toBe("test-plugin");
    expect(api.toggle("@/")).toMatchObject({ open: false, kind: "panel" });
    expect(api.open("@/notes.md")).toMatchObject({
      open: true,
      kind: "resource",
      path: "notes.md",
    });
    expect(store.activeEditorState?.file.path).toBe("notes.md");
    expect(api.close("@/notes.md")).toMatchObject({
      open: false,
      kind: "resource",
    });
  });
});
