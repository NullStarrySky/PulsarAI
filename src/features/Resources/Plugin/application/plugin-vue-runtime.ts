import {
  compile,
  defineComponent,
  markRaw,
  type Component,
} from "vue";
import {
  findPluginNodeByPath,
  flattenPluginFiles,
  pluginConventions,
  pluginNodePath,
  type Plugin,
  type PluginFile,
} from "@/features/Resources/Plugin/domain/plugin-types";

export interface PluginVueRuntimeResult {
  component: Component | null;
  diagnostics: string[];
}

export function compilePluginVueFile(
  plugin: Plugin,
  file: PluginFile,
): PluginVueRuntimeResult {
  const diagnostics: string[] = [];
  const source = typeof file.content === "string" ? file.content : "";
  const template = /<template(?:\s[^>]*)?>([\s\S]*?)<\/template>/i.exec(source)?.[1];
  if (template == null) {
    return { component: null, diagnostics: ["Vue 文件缺少 <template>。"] };
  }
  if (/<script\b/i.test(source)) {
    diagnostics.push("动态插件组件暂不执行 <script>；状态与行为请通过模板插槽或 Feature API 提供。");
  }
  try {
    const components = compilePluginComponentRegistry(plugin, file.id, diagnostics);
    return {
      component: markRaw(defineComponent({
        name: componentName(file.name),
        components,
        render: compile(template),
      })),
      diagnostics,
    };
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
    return { component: null, diagnostics };
  }
}

export function resolvePluginConversationOverride(
  plugins: Plugin[],
): PluginVueRuntimeResult {
  const diagnostics: string[] = [];
  for (const plugin of plugins.filter((item) => item.enabled)) {
    const override = findPluginNodeByPath(
      plugin.root,
      pluginConventions.override,
    );
    if (override?.kind !== "file") continue;
    if (isPassthroughOverride(override.content)) continue;
    const result = compilePluginVueFile(plugin, override);
    diagnostics.push(...result.diagnostics.map((item) => `${plugin.name}：${item}`));
    if (result.component) return { component: result.component, diagnostics };
  }
  return { component: null, diagnostics };
}

function isPassthroughOverride(content: unknown) {
  if (typeof content !== "string") return false;
  return content
    .replace(/\s+/g, "")
    .toLocaleLowerCase() === "<template><slot/></template>";
}

function compilePluginComponentRegistry(
  plugin: Plugin,
  excludedFileId: string,
  diagnostics: string[],
) {
  const folder = findPluginNodeByPath(
    plugin.root,
    pluginConventions.componentsFolder,
  );
  if (folder?.kind !== "folder") return {};
  const registry: Record<string, Component> = {};
  const compiled: Array<{ name: string; template: string }> = [];
  for (const file of flattenPluginFiles(folder)) {
    if (file.id === excludedFileId || !file.name.toLowerCase().endsWith(".vue")) {
      continue;
    }
    const source = typeof file.content === "string" ? file.content : "";
    const template = /<template(?:\s[^>]*)?>([\s\S]*?)<\/template>/i.exec(source)?.[1];
    if (template == null) {
      diagnostics.push(`${pluginNodePath(plugin.root, file.id).join("/")} 缺少 <template>。`);
      continue;
    }
    const name = componentName(file.name);
    compiled.push({ name, template });
  }
  for (const item of compiled) {
    registry[item.name] = markRaw(defineComponent({
      name: item.name,
      components: registry,
      render: compile(item.template),
    }));
  }
  return registry;
}

function componentName(filename: string) {
  const name = filename.replace(/\.[^.]+$/, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return name || "PluginComponent";
}
