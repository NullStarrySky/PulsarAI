import type { Editor } from "@milkdown/kit/core";
import { $node, $remark } from "@milkdown/kit/utils";
import remarkFrontmatter, { type Options } from "remark-frontmatter";

interface FrontmatterMarkdownNode {
  type: "yaml";
  value?: string;
}

const yamlFrontmatterRemark = $remark<"pulsar-yaml-frontmatter", Options>(
  "pulsar-yaml-frontmatter",
  () => remarkFrontmatter,
  "yaml",
);

const yamlFrontmatterNode = $node("yaml_frontmatter", () => ({
  atom: true,
  group: "block",
  selectable: false,
  attrs: {
    value: {
      default: "",
      validate: "string",
    },
  },
  parseDOM: [{
    tag: 'div[data-type="yaml-frontmatter"]',
    getAttrs: (dom) => ({ value: dom.dataset.value ?? "" }),
  }],
  toDOM: (node) => [
    "div",
    {
      "data-type": "yaml-frontmatter",
      "data-value": node.attrs.value,
      "aria-hidden": "true",
      hidden: "true",
    },
  ],
  parseMarkdown: {
    match: (node) => node.type === "yaml",
    runner: (state, node, type) => {
      state.addNode(type, {
        value: (node as FrontmatterMarkdownNode).value ?? "",
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "yaml_frontmatter",
    runner: (state, node) => {
      state.addNode("yaml", undefined, node.attrs.value);
    },
  },
}));

export function yamlFrontmatterFeature(editor: Editor) {
  editor.use(yamlFrontmatterRemark).use(yamlFrontmatterNode);
}
