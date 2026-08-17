import { describe, expect, it } from "vitest";
import { createPluginSelfApi } from "@/features/Plugin/runtime/self-api";
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

    expect(result.message).toEqual([
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
});
