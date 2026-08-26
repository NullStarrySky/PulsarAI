import { describe, expect, it } from "vitest";
import { extractYAMLFormatter } from "@/features/Plugin/environment/tools/yaml-formatter";

describe("extractYAMLFormatter", () => {
  it("extracts frontmatter YAML and returns stripped result with parsed formatter", () => {
    const text = `---
name: test-skill
version: 1.0
enabled: true
---
# Skill Title
This is the skill content.`;

    const res = extractYAMLFormatter(text);
    expect(res).toHaveLength(1);
    expect(res[0].result).toBe("# Skill Title\nThis is the skill content.");
    expect(res[0].formatter).toEqual([
      {
        name: "test-skill",
        version: 1.0,
        enabled: true,
      },
    ]);
  });

  it("extracts yaml code blocks", () => {
    const text = `Hello
\`\`\`yaml
title: Block 1
\`\`\`
World`;

    const res = extractYAMLFormatter(text);
    expect(res[0].result).toBe("Hello\nWorld");
    expect(res[0].formatter).toEqual([{ title: "Block 1" }]);
  });

  it("handles array of text strings", () => {
    const input = [
      "---\nkey: val1\n---\nText 1",
      "---\nkey: val2\n---\nText 2",
    ];

    const res = extractYAMLFormatter(input);
    expect(res).toHaveLength(2);
    expect(res[0].formatter).toEqual([{ key: "val1" }]);
    expect(res[1].formatter).toEqual([{ key: "val2" }]);
  });
});
