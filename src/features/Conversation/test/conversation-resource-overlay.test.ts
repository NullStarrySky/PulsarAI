import { describe, expect, it } from "vitest";
import { reactive } from "vue";
import type {
  ChatMessageContainer,
  ConversationResourceOperationStats,
  ConversationResourceUpdate,
} from "../messages/conversation-types";
import { ConversationResourceOverlay } from "../messages/conversation-resource-overlay";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";

const stats = (): ConversationResourceOperationStats => ({
  total: 0,
  edit: 0,
  create: 0,
  move: 0,
  remove: 0,
  codeAct: { attempted: 0, committed: 0, rolledBack: 0 },
  logCount: 0,
});

function plugin(): Plugin {
  return {
    id: "test-plugin",
    packageId: "package",
    name: "测试",
    icon: "",
    shortDescription: "",
    enabled: true,
    builtIn: false,
    files: [
      {
        id: "note",
        path: "note.md",
        name: "note.md",
        icon: "",
        treeOrder: 0,
        kind: "file",
        content: "base",
        order: 100,
      },
    ],
    emptyFolders: [],
  };
}

function pathWith(update?: ConversationResourceUpdate): ChatMessageContainer[] {
  return [
    {
      id: "assistant",
      role: "assistant",
      conversationid: "chat",
      activeMessage: 0,
      availableNextContainer: [],
      activeNextContainer: null,
      previousContainer: null,
      content: [
        {
          id: "message",
          type: "message",
          content: "",
          createdAt: "2026-01-01T00:00:00.000Z",
          meta: { steps: [], ...(update ? { resourceUpdate: update } : {}) },
        },
      ],
    },
  ];
}

describe("ConversationResourceOverlay", () => {
  it("clones reactive Plugin state without losing binary resources", () => {
    const base = plugin();
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    base.files.push({
      id: "image",
      path: "image.png",
      name: "image.png",
      icon: "",
      treeOrder: 1,
      kind: "file",
      content: bytes,
      order: 100,
    });
    const plugins = reactive([base]) as unknown as Plugin[];

    const overlay = new ConversationResourceOverlay({
      plugins,
      activePath: [],
    });

    const content = overlay.plugins[0]?.files[1]?.content;
    expect(content).toBeInstanceOf(ArrayBuffer);
    expect(content).not.toBe(bytes);
    expect([...new Uint8Array(content as ArrayBuffer)]).toEqual([1, 2, 3]);
  });

  it("replays only the active message version without changing the base Plugin", () => {
    const base = plugin();
    const overlay = new ConversationResourceOverlay({
      plugins: [base],
      activePath: pathWith({
        createdAt: "2026-01-01T00:00:00.000Z",
        stats: stats(),
        operations: [
          {
            type: "edit",
            target: {
              kind: "plugin-node",
              pluginId: "test-plugin",
              resourceId: "note",
            },
            value: {
              id: "note",
              path: "note.md",
              name: "note.md",
              icon: "",
              treeOrder: 0,
              kind: "file",
              content: "branch",
              order: 100,
            },
          },
        ],
      }),
    });

    expect(overlay.plugins[0]?.files[0]).toMatchObject({ content: "branch" });
    expect(base.files[0]).toMatchObject({ content: "base" });
  });

  it("skips history for a Plugin that is not selected in the current environment", () => {
    const overlay = new ConversationResourceOverlay({
      plugins: [plugin()],
      activePath: pathWith({
        createdAt: "2026-01-01T00:00:00.000Z",
        stats: stats(),
        operations: [{
          type: "edit",
          target: {
            kind: "plugin-node",
            pluginId: "builtin-core-plugin",
            resourceId: "core-note",
          },
          value: {
            id: "core-note",
            path: "note.md",
            name: "note.md",
            icon: "",
            treeOrder: 0,
            kind: "file",
            content: "old core change",
            order: 100,
          },
        }],
      }),
    });

    expect(overlay.plugins[0]?.files[0]).toMatchObject({ content: "base" });
  });

  it("rolls a failed CodeAct back synchronously while retaining its final message statistics", () => {
    const updates: ConversationResourceUpdate[] = [];
    const overlay = new ConversationResourceOverlay({
      plugins: [plugin()],
      activePath: [],
      onUpdate: (update) => {
        updates.push(update);
      },
    });

    overlay.begin();
    overlay.writeFile("test-plugin", "note.md", "temporary");
    overlay.writeFile("test-plugin", "created.md", "temporary");
    overlay.rollback();

    expect(overlay.plugins[0]?.files).toHaveLength(1);
    expect(overlay.plugins[0]?.files[0]).toMatchObject({ content: "base" });
    expect(updates[updates.length - 1]).toMatchObject({
      operations: [],
      stats: {
        total: 0,
        codeAct: { attempted: 1, committed: 0, rolledBack: 1 },
      },
    });

    overlay.begin();
    overlay.writeFile("test-plugin", "note.md", "committed");
    overlay.commit();

    expect(overlay.plugins[0]?.files[0]).toMatchObject({
      content: "committed",
    });
    expect(updates[updates.length - 1]).toMatchObject({
      operations: [expect.objectContaining({ type: "edit" })],
      stats: {
        total: 1,
        edit: 1,
        codeAct: { attempted: 2, committed: 1, rolledBack: 1 },
      },
    });
  });

  it("records a file-editor save as a replayable Overlay edit", () => {
    const initial = new ConversationResourceOverlay({
      plugins: [plugin()],
      activePath: [],
    });
    initial.updateFile("test-plugin", "note", {
      content: "edited in chat",
      order: 42,
      insertion: { slot: "context" },
    });
    const update = initial.resourceUpdate();

    const replayed = new ConversationResourceOverlay({
      plugins: [plugin()],
      activePath: pathWith(update),
    });
    expect(replayed.plugins[0]?.files[0]).toMatchObject({
      content: "edited in chat",
      order: 42,
      insertion: { slot: "context" },
    });
    expect(update.operations).toHaveLength(1);
    expect(update.stats).toMatchObject({ total: 1, edit: 1 });
  });
});
