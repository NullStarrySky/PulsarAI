import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import type { CapabilityDefinition } from "../src/features/Capabilities/domain/capability";
import { createCapabilityMarkdownDocument } from "../src/features/Capabilities/domain/capability-markdown";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
});
let capabilityDefinitions: CapabilityDefinition[];
try {
  const registry = await vite.ssrLoadModule(
    "/src/features/Capabilities/application/capability-registry.ts",
  );
  capabilityDefinitions = registry.capabilityDefinitions as CapabilityDefinition[];
} finally {
  await vite.close();
}

const outputPath = fileURLToPath(
  new URL("../docs/api/capability-reference.generated.md", import.meta.url),
);
const unstableCapabilityIds = new Set(["conversation", "plugin"]);
const document = createCapabilityMarkdownDocument(
  capabilityDefinitions.filter(
    (definition) => !unstableCapabilityIds.has(definition.id),
  ),
);
const source = [
  "---",
  `capabilityOutline: ${JSON.stringify(document.outline)}`,
  "editLink: false",
  "---",
  "",
  document.markdown,
].join("\n").trimEnd() + "\n";

await writeFile(outputPath, source, "utf8");
