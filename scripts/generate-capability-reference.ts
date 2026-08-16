import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { FeatureDocs } from "../src/features/Capabilities/types";
import { createDocsMarkdownDocument } from "../src/features/Capabilities/docs-markdown";
import { featureDocs } from "../src/features/Capabilities/docs-index";

const outputPath = fileURLToPath(
  new URL("../docs/api/capability-reference.generated.md", import.meta.url),
);
const unstableFeatureIds = new Set(["conversation", "plugin"]);
const document = createDocsMarkdownDocument(
  featureDocs.filter((docs) => !unstableFeatureIds.has(docs.id)) as FeatureDocs[],
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
