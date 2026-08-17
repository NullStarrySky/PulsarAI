import { h, type Component } from "vue";
import {
  compilePluginVueFile,
} from "@/features/Plugin/editors/vue/plugin-vue-runtime";
import { findPluginNodeByPath } from "@/features/Plugin/tree/plugin-types";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";

function missingComponent(message: string): Component {
  return {
    name: "MissingConversationPluginComponent",
    render: () => h("div", { class: "pulsar-vue-reference-error" }, message),
  };
}

/**
 * `"<Widget.vue />"` is intentionally a filename-only Markdown reference.
 * The owner plugin is supplied by the concrete message's generation metadata,
 * and only direct files in its conventional temp/ folder are eligible.
 */
export function resolveTempComponent(plugin: Plugin | undefined, filename: string) {
  if (!plugin) return { component: missingComponent("找不到生成此消息的插件。") };
  const file = findPluginNodeByPath(plugin, `temp/${filename}`);
  if (file?.kind !== "file") {
    return { component: missingComponent(`临时组件不存在：${filename}`) };
  }
  const runtime = compilePluginVueFile(plugin, file);
  return {
    component: runtime.component
      ?? missingComponent(runtime.diagnostics[0] ?? `无法加载组件：${filename}`),
  };
}
