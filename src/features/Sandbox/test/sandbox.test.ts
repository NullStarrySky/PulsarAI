import { describe, expect, it } from "vitest";
import {
  executeSandboxCodeAsync,
  resolveSandboxMessagesAsync,
  resolveSandboxTextAsync,
} from "../sandbox";

describe("Sandbox", () => {
  it("evaluates async environment capabilities instead of module imports", async () => {
    const value = await executeSandboxCodeAsync(
      'return await imports("./context.md");',
      [{ imports: async (path: string) => path === "./context.md" ? "resolved context" : null }],
    );

    expect(value).toBe("resolved context");
  });

  it("recursively resolves async imports in text", async () => {
    const resources: Record<string, string> = {
      "./first.md": 'first {{ await imports("./second.md") }}',
      "./second.md": "second {{ name }}",
    };
    const imports = async (path: string) => resolveSandboxTextAsync(resources[path]!, [{ name: "Pulsar", imports }]);

    await expect(resolveSandboxTextAsync('root {{ await imports("./first.md") }}', [{ imports }]))
      .resolves.toBe("root first second Pulsar");
  });

  it("splices recursively imported chat messages into the surrounding context", async () => {
    const imports = async () => [{ role: "system" as const, content: "nested {{ name }}" }];
    await expect(resolveSandboxMessagesAsync([
      { role: "system", content: "before" },
      { role: "system", content: '[[ await imports("./nested.chat.json") ]]' },
      { role: "user", content: "after" },
    ], [{ name: "Pulsar", imports }])).resolves.toEqual([
      { role: "system", content: "before" },
      { role: "system", content: "nested Pulsar" },
      { role: "user", content: "after" },
    ]);
  });
});
