import { describe, expect, it } from "vitest";
import { convertSillyTavernSnapshot } from "../SillyTavern/convert/sillytavern-converter";
import { discriminateSillyTavernResource } from "../SillyTavern/convert/sillytavern-discriminator";
import { placeSillyTavernArtifacts } from "../SillyTavern/convert/sillytavern-placer";
import type {
  SillyTavernParsedResource,
  SillyTavernSourceSnapshot,
} from "../SillyTavern/convert/source-types";

function resource(
  relativePath: string,
  kind: SillyTavernParsedResource["discrimination"]["kind"],
  value: Record<string, unknown>,
): SillyTavernParsedResource {
  const segments = relativePath.split("/");
  const name = segments[segments.length - 1] ?? relativePath;
  return {
    id: relativePath,
    source: { path: `C:/SillyTavern/${relativePath}`, relativePath, resourceKind: kind },
    entry: {
      path: `C:/SillyTavern/${relativePath}`,
      relativePath,
      name,
      extension: "json",
      size: 1,
      modifiedAt: null,
    },
    discrimination: { kind, confidence: 1, evidence: [], alternatives: [] },
    value,
  };
}

function snapshot(resources: SillyTavernParsedResource[]): SillyTavernSourceSnapshot {
  return {
    rootPath: "C:/SillyTavern",
    scannedAt: "2026-08-11T00:00:00.000Z",
    characters: [],
    chats: [],
    worldbooks: [],
    presets: [],
    resources,
    settings: {
      power_user: {
        personas: { "Alice.png": "Alice" },
        persona_descriptions: { "Alice.png": { description: "A **user** persona." } },
      },
    },
    diagnostics: [],
  };
}

describe("SillyTavern Quick Reply migration", () => {
  it("recognizes a Quick Replies file instead of treating it as a macro resource", () => {
    const result = discriminateSillyTavernResource({
      path: "C:/SillyTavern/data/default-user/quick-replies/default.json",
      relativePath: "data/default-user/quick-replies/default.json",
      name: "default.json",
      extension: "json",
      size: 1,
      modifiedAt: null,
    }, { name: "Default", qrList: [] });

    expect(result.kind).toBe("quick-reply");
  });

  it("converts Quick Replies to COMMAND actions and personas to user resources", () => {
    const result = convertSillyTavernSnapshot(snapshot([resource(
      "data/default-user/quick-replies/default.json",
      "quick-reply",
      {
        name: "Default",
        qrList: [{ label: "继续", mes: "Continue with {{user}}." }],
      },
    )]));

    const quickReply = result.artifacts.find((artifact) => artifact.kind === "quick-reply");
    const persona = result.artifacts.find((artifact) => artifact.kind === "user-persona");
    expect(quickReply).toMatchObject({ name: "继续", setName: "Default" });
    expect(quickReply?.kind === "quick-reply" && quickReply.content).toBe('Continue with {{("User")}}.');
    expect(persona).toMatchObject({ name: "Alice", markdown: "A **user** persona." });

    const plan = placeSillyTavernArtifacts("C:/SillyTavern", result);
    expect(plan.counts.quickReplies).toBe(1);
    expect(plan.globalPlugins).toContainEqual(expect.objectContaining({
      id: "builtin-core-plugin",
      existing: true,
      quickReplies: [expect.objectContaining({ name: "继续" })],
    }));
  });
});
