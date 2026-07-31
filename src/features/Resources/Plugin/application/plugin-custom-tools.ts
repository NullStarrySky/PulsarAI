import {
  findPluginChildByName,
  findPluginNodeByPath,
  pluginConventions,
  pluginFileType,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFile,
} from "@/features/Resources/Plugin/domain/plugin-types";
import type {
  PluginReferenceDiagnostic,
  PluginReferenceResolver,
} from "@/features/Resources/Plugin/application/plugin-reference-resolver";
import {
  createSandboxFunction,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";

export interface PluginCustomToolDefinition {
  name: string;
  pluginId: string;
  pluginName: string;
  functionId: string;
  functionPath: string;
  promptId: string;
  promptPath: string;
  priority: number;
  prompt: string;
  functionFile: PluginFile;
}

export interface PluginCustomToolCollection {
  definitions: PluginCustomToolDefinition[];
  diagnostics: PluginReferenceDiagnostic[];
  prompt: string;
}

export function collectPluginCustomTools(
  plugins: Plugin[],
  resolver: PluginReferenceResolver,
): PluginCustomToolCollection {
  const diagnostics: PluginReferenceDiagnostic[] = [];
  const candidates: Array<
    PluginCustomToolDefinition & { pluginIndex: number; treeIndex: number }
  > = [];

  plugins.filter((plugin) => plugin.enabled).forEach((plugin, pluginIndex) => {
    const tools = findPluginNodeByPath(plugin.root, pluginConventions.toolsFolder);
    if (tools?.kind !== "folder") return;

    for (const [treeIndex, child] of sortPluginTreeNodes(tools.children).entries()) {
      if (child.kind !== "folder") continue;
      const functionFile = findPluginChildByName(child, pluginConventions.toolEntry);
      const promptFile = findPluginChildByName(child, pluginConventions.toolPrompt);
      if (
        functionFile?.kind !== "file"
        || pluginFileType(functionFile.name) !== "javascript"
      ) {
        diagnostics.push({
          pluginId: plugin.id,
          resourceId: child.id,
          message: `自定义工具 ${child.name} 缺少 ${pluginConventions.toolEntry}。`,
        });
        continue;
      }
      if (
        promptFile?.kind !== "file"
        || pluginFileType(promptFile.name) !== "markdown"
      ) {
        diagnostics.push({
          pluginId: plugin.id,
          resourceId: functionFile.id,
          message: `自定义工具 ${child.name} 缺少 ${pluginConventions.toolPrompt}。`,
        });
        continue;
      }

      try {
        const preparedFunction = resolver.prepareJavaScript(functionFile.id);
        createSandboxFunction(
          preparedFunction.source,
          [preparedFunction.environment],
        );
        candidates.push({
          name: child.name.trim(),
          pluginId: plugin.id,
          pluginName: plugin.name,
          functionId: functionFile.id,
          functionPath: `/${pluginNodePath(plugin.root, functionFile.id).join("/")}`,
          promptId: promptFile.id,
          promptPath: `/${pluginNodePath(plugin.root, promptFile.id).join("/")}`,
          priority: functionFile.priority ?? 100,
          prompt: resolver.renderResource(promptFile.id),
          functionFile,
          pluginIndex,
          treeIndex,
        });
      } catch (error) {
        diagnostics.push({
          pluginId: plugin.id,
          resourceId: functionFile.id,
          message: `无法准备自定义工具 ${child.name}：${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    }
  });

  candidates.sort(
    (a, b) =>
      b.priority - a.priority
      || a.pluginIndex - b.pluginIndex
      || a.treeIndex - b.treeIndex
      || a.functionId.localeCompare(b.functionId),
  );

  const claimedNames = new Set<string>();
  const definitions = candidates.flatMap((candidate) => {
    const key = candidate.name.toLocaleLowerCase();
    if (!candidate.name || claimedNames.has(key)) {
      diagnostics.push({
        pluginId: candidate.pluginId,
        resourceId: candidate.functionId,
        message: candidate.name
          ? `自定义工具名称冲突：${candidate.name}`
          : "自定义工具目录名不能为空。",
      });
      return [];
    }
    claimedNames.add(key);
    return [{
      name: candidate.name,
      pluginId: candidate.pluginId,
      pluginName: candidate.pluginName,
      functionId: candidate.functionId,
      functionPath: candidate.functionPath,
      promptId: candidate.promptId,
      promptPath: candidate.promptPath,
      priority: candidate.priority,
      prompt: candidate.prompt,
      functionFile: candidate.functionFile,
    }];
  });

  return {
    definitions,
    diagnostics,
    prompt: renderPluginCustomToolPrompt(definitions),
  };
}

export function createPluginCustomToolFunction(
  definition: PluginCustomToolDefinition,
  resolver: PluginReferenceResolver,
  environments: SandboxEnvironment[],
) {
  const prepared = resolver.prepareJavaScript(definition.functionId);
  return createSandboxFunction(
    prepared.source,
    [...environments, prepared.environment],
  );
}

export function renderPluginCustomToolPrompt(
  definitions: PluginCustomToolDefinition[],
) {
  if (!definitions.length) return "";
  return [
    "# 自定义工具",
    "",
    "以下函数不是独立模型工具。请在 codeAct 函数中通过 `ctx.tools[名称](...args)` 调用，并显式 return 调用结果。",
    "",
    ...definitions.flatMap((definition) => [
      `## ctx.tools[${JSON.stringify(definition.name)}](...args)`,
      "",
      `来源插件：${definition.pluginName}（${definition.pluginId}）`,
      `函数：${definition.functionPath}（${definition.functionId}）`,
      `说明：${definition.promptPath}（${definition.promptId}）`,
      "",
      definition.prompt.trim(),
      "",
    ]),
  ].join("\n").trim();
}
