import { compile, defineComponent, markRaw, type Component } from "vue";
import {
  pluginConventions,
  pluginDirectoryExists,
  pluginFiles,
  type Plugin,
  type PluginFile,
} from "@/features/Plugin/tree/plugin-types";

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
  const template = /<template(?:\s[^>]*)?>([\s\S]*?)<\/template>/i.exec(
    source,
  )?.[1];
  if (template == null) {
    return { component: null, diagnostics: ["Vue 文件缺少 <template>。"] };
  }
  if (/<script\b/i.test(source)) {
    diagnostics.push(
      "动态插件组件暂不执行 <script>；状态与行为请通过模板插槽或 Feature API 提供。",
    );
  }
  try {
    const components = compilePluginComponentRegistry(
      plugin,
      file.id,
      diagnostics,
    );
    return {
      component: markRaw(
        defineComponent({
          name: componentName(file.name),
          components,
          render: compile(template),
        }),
      ),
      diagnostics,
    };
  } catch (error) {
    diagnostics.push(error instanceof Error ? error.message : String(error));
    return { component: null, diagnostics };
  }
}

export function resolvePluginComponentByName(
  plugin: Plugin,
  name: string,
): PluginVueRuntimeResult {
  if (!pluginDirectoryExists(plugin, pluginConventions.componentsFolder)) {
    return { component: null, diagnostics: ["插件缺少 components/ 目录。"] };
  }
  const file = pluginFiles(plugin).find(
    (item) =>
      item.path.startsWith(`${pluginConventions.componentsFolder}/`) &&
      item.name.toLocaleLowerCase().endsWith(".vue") &&
      componentName(item.name) === name,
  );
  return file
    ? compilePluginVueFile(plugin, file)
    : { component: null, diagnostics: [`插件组件不存在：${name}`] };
}

function compilePluginComponentRegistry(
  plugin: Plugin,
  excludedFileId: string,
  diagnostics: string[],
) {
  if (!pluginDirectoryExists(plugin, pluginConventions.componentsFolder))
    return {};
  const registry: Record<string, Component> = {};
  const compiled: Array<{ name: string; template: string }> = [];
  for (const file of pluginFiles(plugin).filter((item) =>
    item.path.startsWith(`${pluginConventions.componentsFolder}/`),
  )) {
    if (
      file.id === excludedFileId ||
      !file.name.toLowerCase().endsWith(".vue")
    ) {
      continue;
    }
    const source = typeof file.content === "string" ? file.content : "";
    const template = /<template(?:\s[^>]*)?>([\s\S]*?)<\/template>/i.exec(
      source,
    )?.[1];
    if (template == null) {
      diagnostics.push(`${file.path} 缺少 <template>。`);
      continue;
    }
    const name = componentName(file.name);
    compiled.push({ name, template });
  }
  for (const item of compiled) {
    registry[item.name] = markRaw(
      defineComponent({
        name: item.name,
        components: registry,
        render: compile(item.template),
      }),
    );
  }
  return registry;
}

export function componentName(filename: string) {
  const name = filename
    .replace(/\.[^.]+$/, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join("");
  return name || "PluginComponent";
}
