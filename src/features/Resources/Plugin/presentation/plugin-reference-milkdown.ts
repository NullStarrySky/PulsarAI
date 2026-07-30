import type { Node } from "@milkdown/kit/prose/model";
import { nodeRule } from "@milkdown/kit/prose";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as MarkdownNode } from "@milkdown/kit/transformer";
import {
  $inputRule,
  $nodeSchema,
  $prose,
  $remark,
} from "@milkdown/kit/utils";
import type { Editor } from "@milkdown/kit/core";
import {
  findPluginReferenceTokens,
  pluginReferenceKind,
} from "@/features/Resources/Plugin/domain/plugin-reference";

const pluginReferenceNodeId = "pluginReference";
const pluginReferenceDecorationKey = new PluginKey<DecorationSet>(
  "PULSAR_PLUGIN_REFERENCE",
);

type ReferenceMarkdownNode = MarkdownNode & {
  type: string;
  value?: string;
  children?: ReferenceMarkdownNode[];
};

const pluginReferenceRemark = $remark(
  "pluginReferenceSyntax",
  () => () => (tree) => {
    splitReferenceTextNodes(tree as ReferenceMarkdownNode);
  },
);

const pluginReferenceSchema = $nodeSchema(pluginReferenceNodeId, () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: false,
  attrs: {
    target: {
      default: "",
    },
  },
  parseDOM: [{
    tag: `span[data-type="${pluginReferenceNodeId}"]`,
    getAttrs: (dom) => ({
      target: (dom as HTMLElement).dataset.referenceTarget ?? "",
    }),
  }],
  toDOM: (node) => {
    const target = String(node.attrs.target ?? "");
    return [
      "span",
      {
        class: "pulsar-plugin-reference",
        "data-type": pluginReferenceNodeId,
        "data-reference-kind": pluginReferenceKind(target),
        "data-reference-target": target,
      },
      `<@${target}>`,
    ];
  },
  leafText: (node) => `<@${String(node.attrs.target ?? "")}>`,
  parseMarkdown: {
    match: (node) => node.type === pluginReferenceNodeId,
    runner: (state, node, type) => {
      state.addNode(type, {
        target: String(node.value ?? ""),
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === pluginReferenceNodeId,
    runner: (state, node) => {
      state.addNode(
        "text",
        undefined,
        `<@${String(node.attrs.target ?? "")}>`,
      );
    },
  },
}));

const pluginReferenceInputRule = $inputRule((ctx) =>
  nodeRule(
    /<@([^>\r\n]+)>$/,
    pluginReferenceSchema.type(ctx),
    {
      getAttr: (match) => ({
        target: match[1]?.trim() ?? "",
      }),
    },
  )
);

function referenceDecorations(doc: Node) {
  const decorations: Decoration[] = [];
  doc.descendants((node, position, parent) => {
    if (
      !node.isText
      || !node.text
      || parent?.type.name === "code_block"
      || node.marks.some((mark) => mark.type.name === "inlineCode")
    ) {
      return;
    }

    for (const token of findPluginReferenceTokens(node.text)) {
      const kind = pluginReferenceKind(token.target);
      decorations.push(
        Decoration.inline(
          position + token.start,
          position + token.end,
          {
            class: "pulsar-plugin-reference",
            "data-reference-kind": kind,
            "data-reference-target": token.target,
          },
        ),
      );
    }
  });
  return DecorationSet.create(doc, decorations);
}

const pluginReferenceDecoration = $prose(() =>
  new Plugin<DecorationSet>({
    key: pluginReferenceDecorationKey,
    state: {
      init: (_config, state) => referenceDecorations(state.doc),
      apply: (transaction, previous) =>
        transaction.docChanged
          ? referenceDecorations(transaction.doc)
          : previous.map(transaction.mapping, transaction.doc),
    },
    props: {
      decorations: (state) =>
        pluginReferenceDecorationKey.getState(state) ?? DecorationSet.empty,
    },
  }),
);

export const pluginReferenceHighlightFeature = (editor: Editor) => {
  editor
    .use(pluginReferenceRemark)
    .use(pluginReferenceSchema)
    .use(pluginReferenceInputRule)
    .use(pluginReferenceDecoration);
};

function splitReferenceTextNodes(node: ReferenceMarkdownNode) {
  if (
    node.type === "code"
    || node.type === "inlineCode"
    || !Array.isArray(node.children)
  ) {
    return;
  }

  node.children = node.children.flatMap((child) => {
    if (child.type !== "text" || typeof child.value !== "string") {
      splitReferenceTextNodes(child);
      return [child];
    }

    const tokens = findPluginReferenceTokens(child.value);
    if (!tokens.length) return [child];

    const result: ReferenceMarkdownNode[] = [];
    let cursor = 0;
    for (const token of tokens) {
      if (token.start > cursor) {
        result.push({
          type: "text",
          value: child.value.slice(cursor, token.start),
        } as ReferenceMarkdownNode);
      }
      result.push({
        type: pluginReferenceNodeId,
        value: token.target,
      } as ReferenceMarkdownNode);
      cursor = token.end;
    }
    if (cursor < child.value.length) {
      result.push({
        type: "text",
        value: child.value.slice(cursor),
      } as ReferenceMarkdownNode);
    }
    return result;
  });
}
