import { createContentLoader } from "vitepress";
import type { CapabilityMarkdownOutlineItem } from "../../src/features/Capabilities/domain/capability-markdown";

export default createContentLoader("api/capability-reference.generated.md", {
  render: true,
  transform(pages) {
    const page = pages[0];
    return {
      html: page?.html ?? "",
      outline:
        (page?.frontmatter.capabilityOutline as CapabilityMarkdownOutlineItem[] | undefined) ??
        [],
    };
  },
});
