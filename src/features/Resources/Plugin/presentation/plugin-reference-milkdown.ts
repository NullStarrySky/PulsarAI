import type { Node } from "@milkdown/kit/prose/model";
import { nodeRule } from "@milkdown/kit/prose";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { EditorView } from "@milkdown/kit/prose/view";
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
  type PluginReferenceSuggestion,
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
  createPluginReferenceHighlightFeature()(editor);
};

interface ActiveReferenceSuggestion {
  from: number;
  to: number;
  query: string;
  activeIndex: number;
  suggestions: PluginReferenceSuggestion[];
}

export function createPluginReferenceHighlightFeature(
  getSuggestions: () => readonly PluginReferenceSuggestion[] = () => [],
) {
  const suggestionKey = new PluginKey<ActiveReferenceSuggestion | null>(
    `PULSAR_PLUGIN_REFERENCE_SUGGESTIONS_${crypto.randomUUID()}`,
  );
  const suggestionPlugin = $prose(() =>
    new Plugin<ActiveReferenceSuggestion | null>({
      key: suggestionKey,
      state: {
        init: (_config, state) =>
          activeReferenceSuggestion(state, getSuggestions(), 0),
        apply: (transaction, previous, _oldState, nextState) => {
          const requestedIndex = transaction.getMeta(suggestionKey);
          const activeIndex =
            typeof requestedIndex === "number"
              ? requestedIndex
              : previous?.activeIndex ?? 0;
          return activeReferenceSuggestion(
            nextState,
            getSuggestions(),
            activeIndex,
          );
        },
      },
      props: {
        decorations: (state) => {
          const active = suggestionKey.getState(state);
          if (!active) return DecorationSet.empty;
          return DecorationSet.create(state.doc, [
            Decoration.widget(
              active.to,
              (view) => referenceSuggestionMenu(view, active),
              { side: 1 },
            ),
          ]);
        },
        handleKeyDown: (view, event) => {
          const active = suggestionKey.getState(view.state);
          if (!active) return false;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            const delta = event.key === "ArrowDown" ? 1 : -1;
            const next =
              (active.activeIndex + delta + active.suggestions.length)
              % active.suggestions.length;
            view.dispatch(view.state.tr.setMeta(suggestionKey, next));
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            applyReferenceSuggestion(
              view,
              active,
              active.suggestions[active.activeIndex]!,
            );
            return true;
          }
          return false;
        },
      },
    }),
  );

  return (editor: Editor) => {
    editor
      .use(pluginReferenceRemark)
      .use(pluginReferenceSchema)
      .use(pluginReferenceInputRule)
      .use(pluginReferenceDecoration)
      .use(suggestionPlugin);
  };
}

function activeReferenceSuggestion(
  state: EditorState,
  suggestions: readonly PluginReferenceSuggestion[],
  activeIndex: number,
): ActiveReferenceSuggestion | null {
  if (!state.selection.empty) return null;
  const cursor = state.selection.from;
  const parentStart = state.selection.$from.start();
  const before = state.doc.textBetween(parentStart, cursor, "\n", "\0");
  const match = /<@([^>\r\n]*)$/.exec(before);
  if (!match) return null;
  const query = (match[1] ?? "").trim().toLocaleLowerCase();
  const filtered = suggestions
    .filter((item) => {
      const searchable = [
        item.target,
        item.label,
        item.detail,
        item.description ?? "",
      ].join(" ").toLocaleLowerCase();
      return !query || searchable.includes(query);
    })
    .slice(0, 8);
  if (!filtered.length) return null;
  return {
    from: cursor - match[0].length,
    to: cursor,
    query,
    activeIndex: Math.min(Math.max(activeIndex, 0), filtered.length - 1),
    suggestions: filtered,
  };
}

function referenceSuggestionMenu(
  view: EditorView,
  active: ActiveReferenceSuggestion,
) {
  const menu = document.createElement("div");
  menu.className = "pulsar-plugin-reference-suggestions";
  active.suggestions.forEach((suggestion, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pulsar-plugin-reference-suggestion";
    if (index === active.activeIndex) button.dataset.active = "true";
    const heading = document.createElement("span");
    heading.className = "pulsar-plugin-reference-suggestion-heading";
    const label = document.createElement("strong");
    label.textContent = suggestion.label;
    const detail = document.createElement("small");
    detail.textContent = suggestion.detail;
    heading.append(label, detail);
    button.append(heading);
    if (suggestion.description) {
      const description = document.createElement("span");
      description.className = "pulsar-plugin-reference-suggestion-description";
      description.textContent = suggestion.description;
      button.append(description);
    }
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      applyReferenceSuggestion(view, active, suggestion);
    });
    menu.append(button);
  });
  return menu;
}

function applyReferenceSuggestion(
  view: EditorView,
  active: ActiveReferenceSuggestion,
  suggestion: PluginReferenceSuggestion,
) {
  const referenceType = view.state.schema.nodes[pluginReferenceNodeId];
  if (!referenceType) return;
  const node = referenceType.create({ target: suggestion.target });
  const transaction = view.state.tr.replaceWith(active.from, active.to, node);
  transaction.setSelection(
    TextSelection.near(transaction.doc.resolve(active.from + node.nodeSize)),
  );
  view.dispatch(transaction.scrollIntoView());
  view.focus();
}

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
