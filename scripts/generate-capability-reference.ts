import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { capabilityDefinitions } from "../src/features/Capabilities/application/capability-registry";
import { createCapabilityMarkdownDocument } from "../src/features/Capabilities/domain/capability-markdown";

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
  "",
].join("\n");

await writeFile(outputPath, source, "utf8");
