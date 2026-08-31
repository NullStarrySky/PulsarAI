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
  previewPluginResource,
} from "@/features/Plugin/runtime/environment";
import { ctxbuilder } from "@/features/Plugin/runtime/ctx-builder";
import { runWorld } from "@/features/Plugin/runtime/run-api";
import { createBuiltinPlugins } from "@/features/Plugin/tree/builtin-plugins";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { createWorldConfig } from "@/features/Plugin/tree/world-config";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { useMessageStore } from "@/features/Conversation/messages/message-store";
import { usePackageStore } from "@/features/Package/package-store";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";

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

  it("rejects removed @pluginId path syntax", () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "greeting.md", content: "Hello" },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });

    expect(() => api.read("@test-plugin/greeting.md")).toThrow(
      "不再支持显式插件路径",
    );
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
    expect(raw).toBe('Root: {{ await imports("@/context.md") }}');
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
    second.packageId = null;
    const worldConfig = createWorldConfig();
    worldConfig.slots.push({
      id: "multi-plugin-context",
      title: "Context",
      description: "",
      contentSuffixes: ["chat.json"],
      selectionMode: "none",
    });
    const api = createPluginSelfApi(first.id, {
      plugins: [first, second],
      packageId: "pkg-1",
      worldConfig,
    });
    const paths = api.slot.paths("multi-plugin-context", "global");

    expect(paths).toEqual([
      "/self/context.chat.json",
      "/global/plugin-b/context.chat.json",
    ]);
    const messages = await api.parse(paths);
    expect(messages).toEqual([
      { role: "system", content: "from A" },
      { role: "system", content: "from B" },
    ]);
    const readDocument = JSON.parse(
      api.read("/global/plugin-b/context.chat.json") as string,
    );
    expect(readDocument.message[0].content).toContain(
      'imports("/global/plugin-b/detail.md")',
    );
  });

  it("uses complete-world paths and filters injection without hiding files", async () => {
    const local = createMockPlugin("local", [
      { path: "config.json", content: { pluginValue: true } },
      { path: "local.md", content: "local", insertion: { slot: "document" } },
    ]);
    const global = createMockPlugin("global", [
      { path: "global.md", content: '{{ await imports("@/detail.md") }}', insertion: { slot: "document" } },
      { path: "detail.md", content: "global" },
    ]);
    global.packageId = null;
    const worldConfig = createWorldConfig();
    worldConfig.disabled.push("/global/global");
    const api = createPluginSelfApi(local.id, {
      plugins: [local, global],
      packageId: "pkg-1",
      worldConfig,
    });

    expect(api.slot.paths("document")).toEqual(["/self/local.md"]);
    expect(JSON.parse(api.read("@/config.json") as string)).toEqual({ pluginValue: true });
    expect(JSON.parse(api.read("/config.json") as string).slots.some((slot: { id: string }) => slot.id === "generatePath")).toBe(true);
    expect(api.import("/config.json")).toEqual(worldConfig);
    expect(api.read("/global/global/global.md")).toBe('{{ await imports("/global/global/detail.md") }}');
    await expect(api.parse("/global/global/global.md")).resolves.toBe("global");
  });

  it("reports a recursive resource cycle from Sandbox rather than Plugin import", async () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "one.md", content: '{{ await imports("@/two.md") }}' },
      { path: "two.md", content: '{{ await imports("@/one.md") }}' },
    ]);
    const api = createPluginSelfApi("test-plugin", { plugins: [plugin] });
    await expect(api.parse("one.md")).resolves.toContain('imports("@/two.md")');
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

    expect(generate).toContain('imports("@/config.json")');
    expect(generate).toContain('parse(slot.paths("CTX_BUILD", "global"), ctx)');
    expect(api.slot.paths("chat", "global")).toEqual([
      "@/default.chat.json",
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

  it("builds message-bound Plugin capabilities only through ctxbuilder", async () => {
    const plugin = createMockPlugin("test-plugin", [
      {
        path: "generate.js",
        content: "return undefined;",
        insertion: { slot: "generatePath" },
      },
      { path: "tools/add/tool.js", content: "async (left, right) => left + right" },
      { path: "tools/add/prompt.md", content: "Use ctx.add(left, right) to add two numbers." },
    ]);
    const chats = useChatStore();
    const messages = useMessageStore();
    const packages = usePackageStore();
    chats.chats = [{
      id: "chat", packageId: "pkg-1", kind: "chat", title: "chat", rendererId: "chat",
      rootContainerId: "assistant", lastContainerId: "assistant", composerDraft: "",
      createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:00.000Z",
    }];
    const worldConfig = createWorldConfig();
    packages.packages = [{ id: "pkg-1", pluginId: plugin.id, worldConfig }] as any;
    messages.containers = [{
      id: "assistant", conversationid: "chat", role: "assistant", activeMessage: 0,
      availableNextContainer: [], activeNextContainer: null, previousContainer: null,
      content: [{ id: "message", type: "message", content: "", createdAt: "2026-08-28T00:00:00.000Z", meta: { steps: [] } }],
    }];
    messages.persist = vi.fn().mockResolvedValue(undefined);
    usePluginStore().plugins = [plugin];
    const context: SandboxEnvironment = { conversationId: "chat", pluginId: plugin.id };
    const built = await ctxbuilder(context, {
      chat: true,
      conversation: true,
      role: true,
      input: true,
      message: { containerId: "assistant", role: "assistant" },
      plugin: true,
      toolFunction: true,
    });

    expect(context.imports).toBe(built.selfApi?.import);
    expect(context.parse).toEqual(expect.any(Function));
    expect(built.container?.id).toBe("assistant");
    const conversations = context.conversations as { read: () => { id: string } | null };
    const roles = context.roles as { read: () => { id: string } | null };
    const input = context.input as { read: () => string };
    expect(conversations.read()?.id).toBe("chat");
    expect(roles.read()?.id).toBe("pkg-1");
    expect(input.read()).toBe("");
    const add = context.add as (left: number, right: number) => Promise<number>;
    expect(await add(2, 3)).toBe(5);
    expect(built.selfApi?.slot.paths("toolFunction", "global")).toEqual([
      "/self/tools/add/prompt.md",
    ]);
    const readDocs = context.read_docs as (
      id?: string,
    ) => string[] | string | null;
    expect(readDocs()).toEqual(["package", "plugin", "conversation"]);
    expect(readDocs("plugin")).toContain("# Plugin 资源");
    expect(readDocs("missing")).toBeNull();
  });

  it("refuses Plugin capabilities when no message version was requested", async () => {
    await expect(ctxbuilder(
      { conversationId: "chat", pluginId: "test-plugin" },
      { plugin: true },
    )).rejects.toThrow("必须同时请求 message feature");
  });

  it("runs a Plugin against its concrete assistant message version", async () => {
    const plugin = createMockPlugin("test-plugin", [
      {
        path: "generate.js",
        content: 'const result = `${conversationId}:${pluginId}:${container.id}`; await reply.setContent(result); return undefined;',
        insertion: { slot: "generatePath" },
      },
    ]);
    const chats = useChatStore();
    const messages = useMessageStore();
    const packages = usePackageStore();
    chats.chats = [{
      id: "chat", packageId: "pkg-1", kind: "chat", title: "chat", rendererId: "chat",
      rootContainerId: "assistant", lastContainerId: "assistant", composerDraft: "",
      createdAt: "2026-08-28T00:00:00.000Z", updatedAt: "2026-08-28T00:00:00.000Z",
    }];
    const worldConfig = createWorldConfig();
    packages.packages = [{ id: "pkg-1", pluginId: plugin.id, worldConfig }] as any;
    messages.containers = [{
      id: "assistant", conversationid: "chat", role: "assistant", activeMessage: 0,
      availableNextContainer: [], activeNextContainer: null, previousContainer: null,
      content: [{ id: "message", type: "message", content: "", createdAt: "2026-08-28T00:00:00.000Z", meta: { steps: [] } }],
    }];
    messages.persist = vi.fn().mockResolvedValue(undefined);
    usePluginStore().plugins = [plugin];

    const result = await runWorld({
      conversationId: "chat",
      roleId: "pkg-1",
      containerId: "assistant",
    });

    expect(result.containerId).toBe("assistant");
    expect(messages.containers[0]?.content[0]?.content).toBe("chat:test-plugin:assistant");
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

  it("registers a root regex.json in the ordered REGEX slot", () => {
    const plugin = createMockPlugin("test-plugin", [
      { path: "regex.json", content: [] },
    ]);
    const api = createPluginSelfApi(plugin.id, { plugins: [plugin] });

    expect(api.slot.paths("REGEX", "global")).toEqual([
      "@/regex.json",
    ]);
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
