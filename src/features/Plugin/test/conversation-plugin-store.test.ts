import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.hoisted(() => {
  Object.assign(globalThis, {
    window: { pulsarHost: { invoke: async () => null, listen: async () => () => {} } },
  });
});

import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { useMessageStore } from "@/features/Conversation/messages/message-store";
import { usePackageStore } from "@/features/Package/package-store";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { createWorldConfig } from "@/features/Plugin/tree/world-config";

describe("conversation Plugin store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("persists only version-local Plugin changes and incrementally materializes the final tree", async () => {
    const base = usePluginStore();
    const chats = useChatStore();
    const messages = useMessageStore();
    const packages = usePackageStore();
    const root = {
      id: "root", role: "system" as const, conversationid: "chat", activeMessage: 0,
      availableNextContainer: [], activeNextContainer: null, previousContainer: null,
      content: [{ id: "root-message", type: "message" as const, content: "", createdAt: "2026-08-27T00:00:00.000Z", meta: { steps: [] } }],
    };
    messages.containers = [root];
    messages.persist = vi.fn().mockResolvedValue(undefined);
    chats.chats = [{
      id: "chat", packageId: "pkg", kind: "chat", title: "chat", rendererId: "chat",
      rootContainerId: root.id, lastContainerId: root.id, composerDraft: "",
      createdAt: "2026-08-27T00:00:00.000Z", updatedAt: "2026-08-27T00:00:00.000Z",
    }];
    chats.persist = vi.fn().mockResolvedValue(undefined);
    packages.packages = [{ id: "pkg", pluginId: "plugin", worldConfig: createWorldConfig() }] as any;
    base.plugins = [
      {
        id: "plugin", packageId: "pkg", name: "plugin", icon: "", shortDescription: "",
        builtIn: false, emptyFolders: [],
        files: [{ id: "note", kind: "file", name: "note.md", path: "note.md", icon: "", treeOrder: 0, order: 100, content: "base" }],
      },
      {
        id: "global", packageId: null, name: "global", icon: "", shortDescription: "",
        builtIn: false, emptyFolders: [],
        files: [{ id: "global-note", kind: "file", name: "global.md", path: "global.md", icon: "", treeOrder: 0, order: 100, content: "global-base" }],
      },
    ];

    const session = usePluginStore("chat");
    await session.updateFile("plugin", "note", { content: "one" });
    await session.updateFile("plugin", "note", { content: "two" });

    const tail = messages.containers.find((item) => item.id === chats.chats[0]!.lastContainerId)!;
    const message = tail.content[0]!;
    const attached = session.forVersion(tail, message);
    attached.api("plugin").write("/global/global/global.md", "global-conversation");
    attached.api("plugin").move("/global/global/global.md", "/self/global.md");
    await attached.flush();

    expect(session.finalPlugins.value[0]?.files[0]?.content).toBe("two");
    expect(session.finalPlugins.value.find((plugin) => plugin.id === "global")?.files)
      .toHaveLength(0);
    expect(session.finalPlugins.value.find((plugin) => plugin.id === "plugin")?.files)
      .toContainEqual(expect.objectContaining({ path: "global.md", content: "global-conversation" }));

    // A base-tree invalidation must reconstruct both local and global targets
    // from the version-local changes, rather than retain a mutated snapshot.
    base.treeRevision += 1;
    expect(session.finalPlugins.value.find((plugin) => plugin.id === "global")?.files)
      .toHaveLength(0);
    expect(session.finalPlugins.value.find((plugin) => plugin.id === "plugin")?.files)
      .toContainEqual(expect.objectContaining({ path: "global.md", content: "global-conversation" }));

    expect(tail.hidden).toBe(true);
    expect(tail.content[0]?.meta.pluginChanges?.changes).toHaveLength(3);
    expect(tail.content[0]?.meta.pluginChanges?.changes[0]).toMatchObject({
      type: "edit",
      value: { content: "two" },
    });
    expect(tail.content[0]?.meta.pluginChanges?.changes[1]).toMatchObject({
      type: "edit",
      target: { pluginId: "global" },
      value: { content: "global-conversation" },
    });
    expect(tail.content[0]?.meta.pluginChanges?.changes[2]).toMatchObject({
      type: "move",
      pluginId: "global",
      targetPluginId: "plugin",
      name: "global.md",
    });

    const disabledConfig = createWorldConfig(session.config.value);
    disabledConfig.disabled = ["/global/global"];
    await session.configure(disabledConfig);
    expect(session.finalPlugins.value.some((plugin) => plugin.id === "global")).toBe(true);
    expect(session.config.value?.disabled).toEqual(["/global/global"]);
    base.treeRevision += 1;
    expect(session.config.value?.disabled).toEqual(["/global/global"]);
    const selectedConfig = createWorldConfig(session.config.value);
    selectedConfig.disabled = ["/global/global/global.md"];
    await session.configure(selectedConfig);
    expect(session.config.value?.disabled).toEqual([
      "/global/global/global.md",
    ]);
    base.treeRevision += 1;
    expect(session.config.value?.disabled).toEqual([
      "/global/global/global.md",
    ]);
  });
});
