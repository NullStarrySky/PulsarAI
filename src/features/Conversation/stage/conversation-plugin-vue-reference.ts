import { $node, $remark, $view } from "@milkdown/kit/utils";
import { render, h, type Component } from "vue";
import {
  compilePluginVueFile,
} from "@/features/Plugin/editors/vue/plugin-vue-runtime";
import { findPluginNodeByPath } from "@/features/Plugin/tree/plugin-types";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";

type MarkdownNode = {
  type?: string;
  value?: string;
  file?: string;
  children?: MarkdownNode[];
};

const vueReferencePattern = /^<([A-Za-z0-9][A-Za-z0-9._-]*\.vue)\s*\/?>(?:\r?\n)?$/i;

function replaceVueReferenceNodes(node: MarkdownNode) {
  if (node.type === "html" && typeof node.value === "string") {
    const file = vueReferencePattern.exec(node.value)?.[1];
    if (file) {
      node.type = "pulsarVueReference";
      node.file = file;
      delete node.value;
    }
  }
  node.children?.forEach(replaceVueReferenceNodes);
}

export const conversationVueReferenceRemark = $remark(
  "conversationVueReferenceRemark",
  () => () => (tree: MarkdownNode) => replaceVueReferenceNodes(tree),
);

export const conversationVueReferenceNode = $node(
  "conversationVueReference",
  () => ({
    group: "block",
    atom: true,
    attrs: { file: { default: "" } },
    parseMarkdown: {
      match: (node: MarkdownNode) => node.type === "pulsarVueReference",
      runner: (state, node, type) => {
        state.addNode(type, { file: node.file ?? "" });
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "conversationVueReference",
      runner: (state, node) => {
        state.addNode("html", undefined, `<${String(node.attrs.file)} />`);
      },
    },
    toDOM: (node) => ["div", { "data-pulsar-vue": String(node.attrs.file) }],
  }),
);

function missingComponent(message: string): Component {
  return {
    name: "MissingConversationPluginComponent",
    render: () => h("div", { class: "pulsar-vue-reference-error" }, message),
  };
}

export function resolveTempComponent(plugin: Plugin | undefined, filename: string) {
  if (!plugin) return { component: missingComponent("找不到生成此消息的插件。") };
  const file = findPluginNodeByPath(plugin.root, `temp/${filename}`);
  if (file?.kind !== "file") {
    return { component: missingComponent(`临时组件不存在：${filename}`) };
  }
  const runtime = compilePluginVueFile(plugin, file);
  return {
    component: runtime.component
      ?? missingComponent(runtime.diagnostics[0] ?? `无法加载组件：${filename}`),
  };
}

/**
 * `"<Widget.vue />"` is intentionally a filename-only Markdown reference.
 * The owner plugin is supplied by the concrete message's generation metadata,
 * and only direct files in its conventional temp/ folder are eligible.
 */
export function createConversationVueReferenceView(plugin?: Plugin) {
  return $view(conversationVueReferenceNode, () => (node) => {
    const dom = document.createElement("div");
    dom.className = "pulsar-vue-reference";
    const update = (next = node) => {
      const filename = String(next.attrs.file ?? "");
      render(h(resolveTempComponent(plugin, filename).component), dom);
    };
    update();
    return {
      dom,
      update(next) {
        if (next.type !== node.type) return false;
        update(next);
        return true;
      },
      destroy() {
        render(null, dom);
      },
      ignoreMutation: () => true,
    };
  });
}
