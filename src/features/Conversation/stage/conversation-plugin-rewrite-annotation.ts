import { $markSchema, $remark } from "@milkdown/kit/utils";

type MarkdownNode = {
  type?: string;
  value?: string;
  instruction?: string;
  children?: MarkdownNode[];
};

const openingTag = /^<pulsar-rewrite\s+instruction=(?:"([^"]*)"|'([^']*)')\s*>$/i;
const closingTag = /^<\/pulsar-rewrite\s*>$/i;

function decodeAttribute(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function replaceRewriteAnnotations(node: MarkdownNode) {
  node.children?.forEach(replaceRewriteAnnotations);
  if (!node.children?.length) return;

  const children: MarkdownNode[] = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const child = node.children[index];
    const match = child?.type === "html" && typeof child.value === "string"
      ? openingTag.exec(child.value)
      : null;
    if (!child || !match) {
      children.push(child);
      continue;
    }

    const closingIndex = node.children.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index
        && candidate?.type === "html"
        && typeof candidate.value === "string"
        && closingTag.test(candidate.value),
    );
    if (closingIndex < 0) {
      children.push(child);
      continue;
    }
    children.push({
      type: "pulsarRewrite",
      instruction: decodeAttribute(match[1] ?? match[2] ?? ""),
      children: node.children.slice(index + 1, closingIndex),
    });
    index = closingIndex;
  }
  node.children = children;
}

export const conversationRewriteAnnotationRemark = $remark(
  "conversationRewriteAnnotationRemark",
  () => () => (tree: MarkdownNode) => replaceRewriteAnnotations(tree),
);

/** Read-only projection of persisted `<pulsar-rewrite>` source annotations. */
export const conversationRewriteAnnotationMark = $markSchema(
  "pulsarRewrite",
  () => ({
    attrs: { instruction: { default: "" } },
    parseDOM: [{
      tag: "span[data-pulsar-rewrite]",
      getAttrs: (dom: HTMLElement) => ({
        instruction: dom.dataset.pulsarRewrite ?? "",
      }),
    }],
    toDOM: (mark) => [
      "span",
      {
        class: "pulsar-rewrite-annotation",
        "data-pulsar-rewrite": String(mark.attrs.instruction ?? ""),
      },
      0,
    ],
    parseMarkdown: {
      match: (node: MarkdownNode) => node.type === "pulsarRewrite",
      runner: (state, node, markType) => {
        state.openMark(markType, { instruction: node.instruction ?? "" });
        state.next(node.children);
        state.closeMark(markType);
      },
    },
    toMarkdown: {
      match: (mark) => mark.type.name === "pulsarRewrite",
      // Conversation messages are rendered read-only. Source annotations stay
      // authoritative in the message body, so this runner is intentionally
      // not used to rewrite their source representation.
      runner: () => {},
    },
  }),
);
