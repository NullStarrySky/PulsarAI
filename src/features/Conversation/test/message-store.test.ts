import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.hoisted(() => {
  Object.assign(globalThis, {
    window: { pulsarHost: { invoke: async () => null, listen: async () => () => {} } },
  });
});

import { useMessageStore } from "../messages/message-store";

describe("Conversation message store", () => {
  beforeEach(() => { setActivePinia(createPinia()); });

  it("clears translation metadata when a message is manually edited", async () => {
    const messages = useMessageStore();
    messages.persist = vi.fn().mockResolvedValue(undefined);
    const container = {
      id: "message-container", role: "assistant" as const, conversationid: "chat", activeMessage: 0,
      availableNextContainer: [], activeNextContainer: null, previousContainer: null,
      content: [{
        id: "message", type: "message" as const, content: "译文", createdAt: "2026-08-22T00:00:00.000Z",
        meta: { steps: [], translation: { originalContent: "original", translatedAt: "2026-08-22T00:00:00.000Z" } },
      }],
    };
    messages.containers = [container];

    await messages.setMessageContent(container.id, "手动编辑");

    expect(container.content[0]?.content).toBe("手动编辑");
    expect(container.content[0]?.meta.translation).toBeUndefined();
  });
});
