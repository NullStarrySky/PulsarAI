import {
  compileInteractiveDocumentSource,
  type InteractiveDocumentCompileResult,
} from "@/features/Resources/InteractiveDoc/domain/interactive-document";
import {
  resolveSandboxText,
  stringifySandboxValue,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import {
  findPluginReferenceTokens,
  normalizePluginReferenceTarget,
  parseContainerReferenceTarget,
  parsePluginResourceManifest,
  replacePluginReferenceTokens,
  type PluginContainerDeclaration,
  type PluginContainerScope,
} from "@/features/Resources/Plugin/domain/plugin-reference";
import {
  flattenPluginFiles,
  pluginFileType,
  pluginNodePath,
  type Plugin,
  type PluginFile,
} from "@/features/Resources/Plugin/domain/plugin-types";

export interface PluginReferenceDiagnostic {
  pluginId: string;
  resourceId: string;
  message: string;
}

export interface PluginReferenceResolverOptions {
  environment?: SandboxEnvironment;
  sourceOverrides?: Record<string, string>;
}

export interface GenerationResourceValue {
  id: string;
  name: string;
  icon: string;
  content: unknown;
  pluginId: string;
  pluginName: string;
  path: string;
  type: ReturnType<typeof pluginFileType>;
  toString(): string;
}

export interface PluginContainerValue {
  readonly name: string;
  readonly scope: PluginContainerScope;
  get(alias: string): GenerationResourceValue;
  use(alias: string): PluginContainerValue;
  list(): {
    resources: string[];
    containers: string[];
  };
  toString(): string;
}

interface ResourceRecord {
  plugin: Plugin;
  file: PluginFile;
  path: string;
  directory: string;
  source: string;
  declarationSource: string;
}

interface ContainerRecord {
  key: string;
  name: string;
  scope: PluginContainerScope;
  declaration: PluginContainerDeclaration;
  source: ResourceRecord;
  resources: Map<string, ResourceRecord>;
  imports: Map<string, ContainerRecord>;
  value?: PluginContainerValue;
}

export class PluginReferenceResolver {
  readonly diagnostics: PluginReferenceDiagnostic[] = [];
  readonly environment: SandboxEnvironment;
  private readonly records: ResourceRecord[] = [];
  private readonly recordsById = new Map<string, ResourceRecord>();
  private readonly containers = new Map<string, ContainerRecord>();
  private readonly renderCache = new Map<string, string>();
  private readonly renderStack: ResourceRecord[] = [];
  private readonly tracedResourceIds = new Set<string>();

  constructor(
    readonly plugins: Plugin[],
    options: PluginReferenceResolverOptions = {},
  ) {
    this.environment = options.environment ?? {};
    this.indexResources(options.sourceOverrides ?? {});
    this.indexContainers();
  }

  get resolvedResourceIds() {
    return [...this.tracedResourceIds];
  }

  resourceById(resourceId: string) {
    const record = this.recordsById.get(resourceId);
    return record ? this.createResourceValue(record) : null;
  }

  resolveFromResource(resourceId: string, target: string) {
    const record = this.recordsById.get(resourceId);
    if (!record) {
      throw new Error(`引用来源不存在：${resourceId}`);
    }
    return this.resolve(target, record);
  }

  private resolve(target: string, from?: ResourceRecord): unknown {
    const normalized = normalizePluginReferenceTarget(target);
    if (normalized.startsWith("local:")) {
      throw new Error(`local 引用只能由当前文档解析：${normalized}`);
    }
    if (normalized.startsWith("id:")) {
      const resourceId = normalized.slice("id:".length);
      const record = this.recordsById.get(resourceId);
      if (!record) throw new Error(`资源 ID 不存在：${resourceId}`);
      this.tracedResourceIds.add(record.file.id);
      return this.createResourceValue(record);
    }
    if (normalized.startsWith("path:")) {
      if (!from) throw new Error(`path 引用缺少来源文档：${normalized}`);
      const requestedPath = normalized.slice("path:".length);
      const path = resolveResourcePath(from.directory, requestedPath);
      const record = this.records.find(
        (item) =>
          item.plugin.id === from.plugin.id
          && item.path.toLocaleLowerCase() === path.toLocaleLowerCase(),
      );
      if (!record) {
        throw new Error(`插件路径不存在：${from.plugin.name}/${path}`);
      }
      this.tracedResourceIds.add(record.file.id);
      return this.createResourceValue(record);
    }
    if (normalized.startsWith("container:")) {
      const container = this.resolveContainer(normalized, from);
      return this.createContainerValue(container);
    }
    throw new Error(`不支持的引用：${normalized}`);
  }

  compileInteractiveDocument(resourceId: string): InteractiveDocumentCompileResult {
    const record = this.requireRecord(resourceId);
    if (pluginFileType(record.file.name) !== "interactive-document") {
      throw new Error(`资源不是 IMD：${record.path}`);
    }
    this.tracedResourceIds.add(record.file.id);
    const result = compileInteractiveDocumentSource(record.declarationSource, {
      environment: this.environment,
      resolveReference: (target) => this.resolve(target, record),
    });
    this.addCompileDiagnostics(record, result);
    return result;
  }

  prepareJavaScript(resourceId: string) {
    const record = this.requireRecord(resourceId);
    const tokens = findPluginReferenceTokens(record.declarationSource);
    const allowedTargets = new Set(
      tokens.map((token) => normalizePluginReferenceTarget(token.target)),
    );
    const ref = (rawTarget: string) => {
      const target = normalizePluginReferenceTarget(rawTarget);
      if (!allowedTargets.has(target)) {
        throw new Error(`ref() 只能访问源码中显式声明的引用：${target}`);
      }
      return this.resolve(target, record);
    };
    return {
      source: replacePluginReferenceTokens(
        record.declarationSource,
        (token) =>
          `ref(${JSON.stringify(normalizePluginReferenceTarget(token.target))})`,
      ),
      environment: { ref } satisfies SandboxEnvironment,
    };
  }

  renderResource(resourceId: string) {
    const record = this.requireRecord(resourceId);
    const cached = this.renderCache.get(resourceId);
    if (cached !== undefined) return cached;

    const cycleIndex = this.renderStack.findIndex(
      (item) => item.file.id === record.file.id,
    );
    if (cycleIndex >= 0) {
      const chain = [
        ...this.renderStack.slice(cycleIndex).map((item) => item.path),
        record.path,
      ];
      throw new Error(`检测到引用循环：${chain.join(" -> ")}`);
    }

    this.tracedResourceIds.add(record.file.id);
    this.renderStack.push(record);
    try {
      const type = pluginFileType(record.file.name);
      let rendered: string;
      if (type === "interactive-document") {
        const result = this.compileInteractiveDocument(record.file.id);
        rendered = result.markdown;
      } else if (
        type === "markdown"
        || type === "text"
        || type === "component"
      ) {
        rendered = this.renderText(record);
      } else if (type === "javascript") {
        rendered = this.prepareJavaScript(record.file.id).source;
      } else if (typeof record.file.content === "string") {
        rendered = record.declarationSource;
      } else if (record.file.content == null) {
        rendered = "";
      } else {
        rendered = JSON.stringify(record.file.content, null, 2);
      }
      this.renderCache.set(resourceId, rendered);
      return rendered;
    } finally {
      this.renderStack.pop();
    }
  }

  private renderText(record: ResourceRecord) {
    const tokens = findPluginReferenceTokens(record.declarationSource);
    const allowedTargets = new Set(
      tokens.map((token) => normalizePluginReferenceTarget(token.target)),
    );
    const ref = (rawTarget: string) => {
      const target = normalizePluginReferenceTarget(rawTarget);
      if (!allowedTargets.has(target)) {
        throw new Error(`ref() 只能访问文本中显式声明的引用：${target}`);
      }
      return this.resolve(target, record);
    };
    const macroRanges = findMacroRanges(record.declarationSource);
    const prepared = replacePluginReferenceTokens(
      record.declarationSource,
      (token) => {
        const target = normalizePluginReferenceTarget(token.target);
        const insideMacro = macroRanges.some(
          ([start, end]) => token.start >= start && token.end <= end,
        );
        return insideMacro
          ? `ref(${JSON.stringify(target)})`
          : stringifySandboxValue(ref(target));
      },
    );
    return resolveSandboxText(prepared, [{ ...this.environment, ref }]);
  }

  private indexResources(sourceOverrides: Record<string, string>) {
    for (const plugin of this.plugins.filter((item) => item.enabled)) {
      for (const file of flattenPluginFiles(plugin.root)) {
        const path = pluginNodePath(plugin.root, file.id).join("/");
        const rawContent = sourceOverrides[file.id] ?? file.content;
        const source = typeof rawContent === "string" ? rawContent : "";
        const manifest = parsePluginResourceManifest(source);
        const record: ResourceRecord = {
          plugin,
          file: rawContent === file.content ? file : { ...file, content: rawContent },
          path,
          directory: parentResourcePath(path),
          source,
          declarationSource: manifest.source,
        };
        this.records.push(record);
        if (!this.recordsById.has(file.id)) {
          this.recordsById.set(file.id, record);
        } else {
          this.diagnostics.push({
            pluginId: plugin.id,
            resourceId: file.id,
            message: `资源 ID 重复：${file.id}`,
          });
        }
      }
    }
  }

  private indexContainers() {
    for (const record of this.records) {
      const manifest = parsePluginResourceManifest(record.source);
      for (const declaration of manifest.containers) {
        const key = containerKey(declaration.scope, declaration.name, record);
        if (this.containers.has(key)) {
          this.diagnostics.push({
            pluginId: record.plugin.id,
            resourceId: record.file.id,
            message: `容器声明冲突：${declaration.scope}/${declaration.name}`,
          });
          continue;
        }
        this.containers.set(key, {
          key,
          name: declaration.name,
          scope: declaration.scope,
          declaration,
          source: record,
          resources: new Map(),
          imports: new Map(),
        });
      }
    }

    for (const record of this.records) {
      const manifest = parsePluginResourceManifest(record.source);
      for (const membership of manifest.memberships) {
        try {
          const container = this.resolveContainer(
            membership.container,
            record,
          );
          const alias =
            membership.alias
            || record.file.name.replace(/\.[^.]+$/, "")
            || record.file.id;
          if (container.resources.has(alias)) {
            throw new Error(
              `容器 ${container.name} 中的资源别名冲突：${alias}`,
            );
          }
          container.resources.set(alias, record);
        } catch (error) {
          this.diagnostics.push({
            pluginId: record.plugin.id,
            resourceId: record.file.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    for (const container of this.containers.values()) {
      for (const item of container.declaration.imports) {
        try {
          const imported = this.resolveContainer(item.target, container.source);
          if (
            container.imports.has(item.alias)
            || container.resources.has(item.alias)
          ) {
            throw new Error(
              `容器 ${container.name} 中的导入别名冲突：${item.alias}`,
            );
          }
          container.imports.set(item.alias, imported);
        } catch (error) {
          this.diagnostics.push({
            pluginId: container.source.plugin.id,
            resourceId: container.source.file.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private resolveContainer(target: string, from?: ResourceRecord) {
    const normalized = normalizePluginReferenceTarget(target);
    const parsed = parseContainerReferenceTarget(normalized);
    if (parsed.scope === "auto") {
      if (!from) {
        throw new Error(`容器简称缺少来源文档：${target}`);
      }
      const keys = [
        `root:${from.plugin.id}:${from.directory}:${parsed.name}`,
        `plugin:${from.plugin.id}:${parsed.name}`,
        `global:${parsed.name}`,
      ];
      const matches = keys.flatMap((key) => {
        const container = this.containers.get(key);
        return container ? [container] : [];
      });
      if (matches.length > 1) {
        throw new Error(
          `容器简称存在歧义：${parsed.name}；请写明 root、plugin 或 global 范围`,
        );
      }
      const match = matches[0];
      if (!match) throw new Error(`容器不存在：${parsed.name}`);
      return match;
    }
    if (!from && parsed.scope !== "global") {
      throw new Error(`容器引用缺少来源文档：${normalized}`);
    }
    const key = parsed.scope === "global"
      ? `global:${parsed.name}`
      : parsed.scope === "plugin"
        ? `plugin:${from!.plugin.id}:${parsed.name}`
        : `root:${from!.plugin.id}:${from!.directory}:${parsed.name}`;
    const container = this.containers.get(key);
    if (!container) throw new Error(`容器不存在：${normalized}`);
    return container;
  }

  private createContainerValue(record: ContainerRecord): PluginContainerValue {
    if (record.value) return record.value;
    const value: PluginContainerValue = {
      name: record.name,
      scope: record.scope,
      get: (alias) => {
        const resource = record.resources.get(alias);
        if (!resource) {
          throw new Error(`容器 ${record.name} 没有资源：${alias}`);
        }
        this.tracedResourceIds.add(resource.file.id);
        return this.createResourceValue(resource);
      },
      use: (alias) => {
        const imported = record.imports.get(alias);
        if (!imported) {
          throw new Error(`容器 ${record.name} 没有导入：${alias}`);
        }
        return this.createContainerValue(imported);
      },
      list: () => ({
        resources: [...record.resources.keys()],
        containers: [...record.imports.keys()],
      }),
      toString: () =>
        `[Container ${record.scope}/${record.name}: ${
          [...record.resources.keys()].join(", ")
        }]`,
    };
    record.value = Object.freeze(value);
    return record.value;
  }

  private createResourceValue(record: ResourceRecord): GenerationResourceValue {
    return {
      id: record.file.id,
      name: record.file.name,
      icon: record.file.icon,
      content: record.file.content,
      pluginId: record.plugin.id,
      pluginName: record.plugin.name,
      path: record.path,
      type: pluginFileType(record.file.name),
      toString: () => this.renderResource(record.file.id),
    };
  }

  private requireRecord(resourceId: string) {
    const record = this.recordsById.get(resourceId);
    if (!record) throw new Error(`资源不存在：${resourceId}`);
    return record;
  }

  private addCompileDiagnostics(
    record: ResourceRecord,
    result: InteractiveDocumentCompileResult,
  ) {
    for (const error of result.errors) {
      this.diagnostics.push({
        pluginId: record.plugin.id,
        resourceId: record.file.id,
        message: `${record.path} (${error.sourceId})：${error.message}`,
      });
    }
  }
}

export function createPluginReferenceResolver(
  plugins: Plugin[],
  options: PluginReferenceResolverOptions = {},
) {
  return new PluginReferenceResolver(plugins, options);
}

function containerKey(
  scope: PluginContainerScope,
  name: string,
  record: ResourceRecord,
) {
  if (scope === "global") return `global:${name}`;
  if (scope === "plugin") return `plugin:${record.plugin.id}:${name}`;
  return `root:${record.plugin.id}:${record.directory}:${name}`;
}

function parentResourcePath(path: string) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function resolveResourcePath(directory: string, requestedPath: string) {
  const portablePath = requestedPath.replace(/\\/g, "/");
  const absolute = portablePath.startsWith("/");
  const parts = (absolute ? portablePath.slice(1) : `${directory}/${portablePath}`)
    .split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!normalized.length) {
        throw new Error(`路径越过插件根目录：${requestedPath}`);
      }
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return normalized.join("/");
}

function findMacroRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  for (const match of source.matchAll(/(\{\{[\s\S]*?\}\}|\[\[[\s\S]*?\]\])/g)) {
    if (match.index == null) continue;
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}
