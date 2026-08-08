import {
  compilePluginChatContext,
  createContextDataFacade,
  type ContextDocumentDataBinding,
  type PluginChatCompileResult,
  type ContextDataValue,
} from "@/features/Resources/Plugin/domain/plugin-chat";
import {
  parsePluginDataDefinition,
  pluginDataInstanceKey,
  type PluginDataIsolation,
} from "@/features/Resources/Plugin/domain/plugin-data";
import {
  manifestValueAt,
  parsePluginManifest,
  parsePluginManifestReference,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import {
  executeSandboxCode,
  resolveSandboxText,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import { createPluginConditionEnvironment } from "@/features/Resources/Plugin/application/plugin-condition-environment";
import {
  parsePluginContainerDefinitions,
  parseContainerReferenceTarget,
  pluginFileMatchesContainerSuffix,
  type PluginContainerDeclaration,
  type PluginContainerScope,
} from "@/features/Resources/Plugin/domain/plugin-reference";
import {
  findPluginImportCalls,
  type PluginImportSuggestion,
  type PluginImports,
} from "@/features/Resources/Plugin/domain/plugin-import";
import {
  flattenPluginFiles,
  pluginConventions,
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
  dataOverrides?: Record<string, ContextDataValue>;
}

export interface GenerationResourceValue {
  id: string;
  name: string;
  icon: string;
  content: unknown;
  order: number;
  pluginId: string;
  pluginName: string;
  path: string;
  type: ReturnType<typeof pluginFileType>;
  toString(): string;
}

export interface PluginContainerValue {
  readonly name: string;
  readonly title: string;
  readonly contentSuffixes: string[];
  readonly scope: PluginContainerScope;
  get(path: string): unknown;
  list(): { resources: string[] };
  toString(): string;
}

export interface PluginContainerResourceQuery {
  id: string;
  name: string;
  path: string;
  type: ReturnType<typeof pluginFileType>;
  order: number;
  pluginId: string;
  pluginName: string;
}

export interface PluginContainerContentQuery extends PluginContainerResourceQuery {
  containerPath: string;
  condition?: string;
}

export interface PluginContainerQuery {
  id: string;
  name: string;
  title: string;
  contentSuffixes: string[];
  scope: PluginContainerScope;
  description?: string;
  pluginId: string;
  pluginName: string;
  definitionId: string;
  path: string;
  usedByCount: number;
  contentCount: number;
}

export interface PluginContainerDetailsQuery extends PluginContainerQuery {
  usedBy: PluginContainerResourceQuery[];
  contents: PluginContainerContentQuery[];
}

export interface PluginContainerReadResult {
  containerId: string;
  containerPath: string;
  contents: PluginContainerContentQuery[];
  resources: Array<PluginContainerContentQuery & { content: string }>;
}

export interface ResolvedPluginDataBinding extends ContextDocumentDataBinding {
  isolation: PluginDataIsolation;
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
  id: string;
  key: string;
  name: string;
  scope: PluginContainerScope;
  declaration: PluginContainerDeclaration;
  source: ResourceRecord;
  resources: Map<string, {
    record: ResourceRecord;
    condition?: string;
  }>;
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
  private readonly resourceValues = new WeakSet<object>();
  private dataOverrides: Record<string, ContextDataValue>;

  constructor(
    readonly plugins: Plugin[],
    options: PluginReferenceResolverOptions = {},
  ) {
    this.environment = options.environment ?? {};
    this.dataOverrides = structuredClone(options.dataOverrides ?? {});
    this.indexResources(options.sourceOverrides ?? {});
    this.indexContainers();
  }

  get resolvedResourceIds() {
    return [...this.tracedResourceIds];
  }

  setDataOverrides(
    values: Record<string, ContextDataValue>,
  ) {
    this.dataOverrides = structuredClone(values);
    this.renderCache.clear();
  }

  resourceById(resourceId: string) {
    const record = this.recordsById.get(resourceId);
    return record ? this.createResourceValue(record) : null;
  }

  isResourceValue(value: unknown): value is GenerationResourceValue {
    return Boolean(
      value
      && typeof value === "object"
      && this.resourceValues.has(value),
    );
  }

  importSuggestionsFromResource(resourceId: string): PluginImportSuggestion[] {
    const from = this.requireRecord(resourceId);
    const resources = this.records
      .filter((record) => record.plugin.id === from.plugin.id && record.file.id !== from.file.id)
      .map((record) => {
        const path = relativeResourcePath(from.directory, record.path);
        return {
          label: record.file.name,
          apply: `imports.resource(${JSON.stringify(path)})`,
          detail: `${record.path} · ${record.file.id}`,
          description: `导入 ${pluginFileType(record.file.name)} 资源`,
        };
      });
    const containers = [...this.containers.values()]
      .filter((container) =>
        container.scope === "global"
        || container.source.plugin.id === from.plugin.id
      )
      .map((container) => ({
        label: container.name,
        apply: `imports.container(${JSON.stringify(container.scope)}, ${JSON.stringify(container.name)})`,
        detail: `${container.scope} · ${container.source.plugin.name}`,
        description: container.declaration.description?.trim() || undefined,
      }));
    const configs = this.plugins.flatMap((plugin) => {
      if (plugin.id !== from.plugin.id && plugin.packageId !== null) return [];
      const record = this.manifestRecord(plugin.id);
      if (!record) return [];
      const parsed = parsePluginManifest(record.file.content);
      return parsed.manifest.flatMap((groupContent) =>
        groupContent.content.map((content) => ({
          label: content.title,
          apply: plugin.id === from.plugin.id
            ? `imports.config.local(${JSON.stringify(groupContent.group.id)}, ${JSON.stringify(content.id)})`
            : `imports.config.global(${JSON.stringify(plugin.id)}, ${JSON.stringify(groupContent.group.id)}, ${JSON.stringify(content.id)})`,
          detail: `${groupContent.group.title} · ${plugin.name}`,
          description: content.description,
        }))
      );
    });
    return [...resources, ...containers, ...configs];
  }

  listContainers(): PluginContainerQuery[] {
    return [...this.containers.values()].map((container) =>
      this.createContainerQuery(container),
    );
  }

  getContainer(containerId: string): PluginContainerDetailsQuery | null {
    const container = [...this.containers.values()].find(
      (item) => item.id === containerId,
    );
    if (!container) return null;
    const usedBy = this.records
      .filter((record) => this.resourceUsesContainer(record, container))
      .map((record) => this.createResourceQuery(record));
    const contents = [...container.resources.entries()].map(
      ([containerPath, entry]) => ({
        containerPath,
        ...this.createResourceQuery(entry.record),
        ...(entry.condition
          ? { condition: entry.condition }
          : {}),
      }),
    );
    return {
      ...this.createContainerQuery(container, {
        usedByCount: usedBy.length,
        contentCount: contents.length,
      }),
      usedBy,
      contents,
    };
  }

  listContainerContents(
    containerId: string,
    input: { cursor?: number; limit?: number } = {},
  ) {
    const details = this.getContainer(containerId);
    if (!details) return null;
    const cursor = Math.max(0, Math.trunc(input.cursor ?? 0));
    const limit = Math.min(100, Math.max(1, Math.trunc(input.limit ?? 50)));
    const contents = details.contents.slice(cursor, cursor + limit);
    const nextCursor = cursor + contents.length < details.contents.length
      ? cursor + contents.length
      : null;
    return {
      containerId,
      containerPath: details.path,
      total: details.contents.length,
      cursor,
      nextCursor,
      contents,
    };
  }

  readContainer(
    containerId: string,
    resourceIds?: string[],
  ): PluginContainerReadResult {
    const container = [...this.containers.values()].find(
      (item) => item.id === containerId,
    );
    if (!container) throw new Error(`容器不存在：${containerId}`);
    const entries = [...container.resources.entries()].map(([containerPath, entry]) => ({
      containerPath,
      entry,
      query: {
        containerPath,
        ...this.createResourceQuery(entry.record),
        ...(entry.condition
          ? { condition: entry.condition }
          : {}),
      } satisfies PluginContainerContentQuery,
    }));
    const selectedIds = [...new Set(
      (resourceIds ?? entries.map((item) => item.entry.record.file.id))
        .map((item) => item.trim())
        .filter(Boolean),
    )];
    const allowedIds = new Set(entries.map((item) => item.entry.record.file.id));
    const invalidId = selectedIds.find((id) => !allowedIds.has(id));
    if (invalidId) {
      throw new Error(`资源不属于容器 ${container.name}：${invalidId}`);
    }
    const selected = selectedIds.map((id) =>
      entries.find((item) => item.entry.record.file.id === id)!
    );
    return {
      containerId,
      containerPath: this.createContainerQuery(container).path,
      contents: selected.map((item) => item.query),
      resources: selected.map((item) => ({
        ...item.query,
        content: this.renderResource(item.entry.record.file.id),
      })),
    };
  }

  private resolveResourcePath(from: ResourceRecord, requestedPath: string) {
    const path = resolveResourcePath(from.directory, requestedPath);
    const record = this.records.find(
      (item) =>
        item.plugin.id === from.plugin.id
        && item.path.toLocaleLowerCase() === path.toLocaleLowerCase(),
    );
    if (!record) {
      throw new Error(`插件路径不存在：${from.plugin.name}/${path}`);
    }
    return record;
  }

  private createImportedValue(from: ResourceRecord, target: ResourceRecord) {
    this.tracedResourceIds.add(target.file.id);
    if (pluginFileType(target.file.name) !== "data") {
      return this.createResourceValue(target);
    }
    const parsed = parsePluginDataDefinition(target.file.content);
    for (const diagnostic of parsed.diagnostics) {
      this.addDataDiagnostic(
        target,
        `${target.path} (${diagnostic.path})：${diagnostic.message}`,
      );
    }
    const stateKey = pluginDataInstanceKey(
      target.file.id,
      parsed.definition.isolation,
      from.file.id,
    );
    const value = Object.prototype.hasOwnProperty.call(this.dataOverrides, stateKey)
      ? this.dataOverrides[stateKey]!
      : parsed.definition.initialValue;
    return createContextDataFacade(
      {
        name: stateKey,
        wrapperSource: parsed.definition.wrapperSource,
      },
      structuredClone(value),
      { readonly: true },
    );
  }

  compileChatContext(
    resourceId: string,
    options: {
      dataOverrides?: Record<string, ContextDataValue>;
      environment?: SandboxEnvironment;
    } = {},
  ): PluginChatCompileResult {
    const record = this.requireRecord(resourceId);
    if (pluginFileType(record.file.name) !== "chat") {
      throw new Error(`上下文资源不是 .chat.json：${record.path}`);
    }
    this.tracedResourceIds.add(record.file.id);
    if (options.dataOverrides) this.setDataOverrides(options.dataOverrides);
    return compilePluginChatContext(record.file.content, {
      environment: {
        ...this.environment,
        ...(options.environment ?? {}),
        imports: this.importsForResource(record.file.id),
      },
      dataOverrides: options.dataOverrides,
      dataBindings: this.dataBindingsForResource(record.file.id),
    });
  }

  dataBindingsForResource(resourceId: string): ResolvedPluginDataBinding[] {
    const record = this.requireRecord(resourceId);
    const seen = new Set<string>();
    return findPluginImportCalls(record.declarationSource).flatMap((call) => {
      if (call.kind !== "resource" && call.kind !== "resourceById") return [];
      let target: ResourceRecord;
      try {
        target = call.kind === "resource"
          ? this.resolveResourcePath(record, call.value)
          : this.requireRecord(call.value);
      } catch (error) {
        this.addDataDiagnostic(
          record,
          error instanceof Error ? error.message : String(error),
        );
        return [];
      }
      if (pluginFileType(target.file.name) !== "data") return [];
      const parsed = parsePluginDataDefinition(target.file.content);
      for (const diagnostic of parsed.diagnostics) {
        this.addDataDiagnostic(
          target,
          `${target.path} (${diagnostic.path})：${diagnostic.message}`,
        );
      }
      const stateKey = pluginDataInstanceKey(
        target.file.id,
        parsed.definition.isolation,
        record.file.id,
      );
      if (seen.has(stateKey)) return [];
      seen.add(stateKey);
      return [{
        id: stateKey,
        name: stateKey,
        alias: stateKey,
        dataId: target.file.id,
        stateKey,
        resourceId: record.file.id,
        path: `/${target.path}`,
        initialValue: parsed.definition.initialValue,
        description: parsed.definition.description,
        enableUpdater: parsed.definition.enableUpdater,
        wrapperSource: parsed.definition.wrapperSource,
        isolation: parsed.definition.isolation,
        pluginId: target.plugin.id,
        pluginName: target.plugin.name,
      }];
    });
  }

  importsForResource(resourceId: string): PluginImports {
    const from = this.requireRecord(resourceId);
    return Object.freeze({
      resource: (path: string) =>
        this.createImportedValue(from, this.resolveResourcePath(from, path)),
      resourceById: (targetId: string) =>
        this.createImportedValue(from, this.requireRecord(targetId)),
      container: (scope: PluginContainerScope, name: string) =>
        this.createContainerValue(
          this.resolveContainer(`container:${scope}/${name}`, from),
          from,
        ),
      containers: (scope: PluginContainerScope, pattern: string) =>
        this.resolveContainers(scope, pattern, from).map((container) =>
          this.createContainerValue(container, from)
        ),
      config: Object.freeze({
        local: (groupId: string, contentId: string) =>
          this.resolveManifestValue(
            `config:local/${groupId}/${contentId}`,
            from,
          ),
        global: (pluginId: string, groupId: string, contentId: string) =>
          this.resolveManifestValue(
            `config:global/${pluginId}/${groupId}/${contentId}`,
            from,
          ),
      }),
    });
  }

  listDataBindings(): ResolvedPluginDataBinding[] {
    return this.records.flatMap((record) =>
      this.dataBindingsForResource(record.file.id)
    );
  }

  prepareJavaScript(resourceId: string) {
    const record = this.requireRecord(resourceId);
    this.tracedResourceIds.add(record.file.id);
    return {
      source: record.declarationSource,
      environment: {
        imports: this.importsForResource(record.file.id),
      } satisfies SandboxEnvironment,
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
      if (
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
    const data = Object.fromEntries(
      this.dataBindingsForResource(record.file.id).map((binding) => {
        const value = Object.prototype.hasOwnProperty.call(
            this.dataOverrides,
            binding.stateKey,
          )
          ? this.dataOverrides[binding.stateKey]!
          : binding.initialValue;
        return [
          binding.alias,
          createContextDataFacade(
            { name: binding.alias, wrapperSource: binding.wrapperSource },
            structuredClone(value),
            { readonly: true },
          ),
        ];
      }),
    );
    return resolveSandboxText(record.declarationSource, [{
      ...this.environment,
      data,
      DATA: data,
      imports: this.importsForResource(record.file.id),
    }]);
  }

  private indexResources(sourceOverrides: Record<string, string>) {
    for (const plugin of this.plugins) {
      for (const file of flattenPluginFiles(plugin.root)) {
        const path = pluginNodePath(plugin.root, file.id).join("/");
        const rawContent = sourceOverrides[file.id] ?? file.content;
        const source = typeof rawContent === "string" ? rawContent : "";
        const record: ResourceRecord = {
          plugin,
          file: rawContent === file.content ? file : { ...file, content: rawContent },
          path,
          directory: parentResourcePath(path),
          source,
          declarationSource: source,
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
      const isDefinitionsFile =
        record.path.toLocaleLowerCase()
          === pluginConventions.containers.toLocaleLowerCase();
      if (!isDefinitionsFile) continue;
      const definitions = parsePluginContainerDefinitions(record.file.content);
      this.diagnostics.push(...definitions.diagnostics.map((diagnostic) => ({
        pluginId: record.plugin.id,
        resourceId: record.file.id,
        message: `${diagnostic.path}：${diagnostic.message}`,
      })));
      for (const declaration of definitions.containers) {
        const key = containerKey(declaration.scope, declaration.id, record);
        if (this.containers.has(key)) {
          this.diagnostics.push({
            pluginId: record.plugin.id,
            resourceId: record.file.id,
            message: `容器声明冲突：${declaration.scope}/${declaration.id}`,
          });
          continue;
        }
        this.containers.set(key, {
          id: createPluginContainerQueryId(
            declaration.scope,
            declaration.id,
            record.plugin.id,
            record.directory,
          ),
          key,
          name: declaration.id,
          scope: declaration.scope,
          declaration,
          source: record,
          resources: new Map(),
        });
      }
    }

    for (
      const record of [...this.records].sort(
        (a, b) =>
          b.file.order - a.file.order
          || a.plugin.id.localeCompare(b.plugin.id)
          || a.path.localeCompare(b.path)
          || a.file.id.localeCompare(b.file.id),
      )
    ) {
      const insertion = record.file.insertion;
      if (insertion) {
        try {
          if (!this.insertionEnabled(record, insertion.condition)) continue;
          const container = this.resolveContainer(
            insertion.target,
            record,
          );
          if (!pluginFileMatchesContainerSuffix(record.file.name, container.declaration.contentSuffixes)) {
            throw new Error(`容器 ${container.name} 不接受 ${record.file.name}`);
          }
          const containerPath = `${record.plugin.id}/${record.path}`;
          container.resources.set(containerPath, { record, condition: insertion.condition });
        } catch (error) {
          this.diagnostics.push({
            pluginId: record.plugin.id,
            resourceId: record.file.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

  }

  private insertionEnabled(
    record: ResourceRecord,
    condition?: string,
  ) {
    if (!condition?.trim()) return true;
    return Boolean(executeSandboxCode(condition, [{
      ...this.environment,
      ...createPluginConditionEnvironment(this.environment.chat ?? this.environment.CHAT),
      imports: this.importsForResource(record.file.id),
    }]));
  }

  private resolveManifestValue(rawReference: string, from?: ResourceRecord) {
    const reference = parsePluginManifestReference(rawReference);
    const plugin = reference.scope === "local"
      ? from?.plugin
      : this.plugins.find(
          (item) => item.packageId === null && item.id === reference.pluginId,
        );
    if (!plugin) {
      throw new Error(
        reference.scope === "local"
          ? `本地配置引用缺少来源资源：${rawReference}`
          : `全局配置插件不可见：${reference.pluginId}`,
      );
    }
    const manifestRecord = this.manifestRecord(plugin.id);
    if (!manifestRecord) throw new Error(`插件 ${plugin.name} 缺少 manifest.json。`);
    const parsed = parsePluginManifest(manifestRecord.file.content);
    if (parsed.diagnostics.length) {
      throw new Error(
        `插件 ${plugin.name} 的 manifest.json 无效：${parsed.diagnostics[0]!.message}`,
      );
    }
    this.tracedResourceIds.add(manifestRecord.file.id);
    return manifestValueAt(
      parsed.manifest,
      reference.groupId,
      reference.contentId,
    );
  }

  private manifestRecord(pluginId: string) {
    return this.records.find(
      (record) =>
        record.plugin.id === pluginId
        && record.path.toLocaleLowerCase()
          === pluginConventions.manifest.toLocaleLowerCase(),
    );
  }

  private resolveContainer(target: string, from?: ResourceRecord) {
    const parsed = parseContainerReferenceTarget(target);
    if (parsed.scope === "auto") {
      if (!from) {
        throw new Error(`容器简称缺少来源文档：${target}`);
      }
      const keys = [
        `local:${from.plugin.id}:${parsed.name}`,
        `global:${parsed.name}`,
      ];
      const matches = keys.flatMap((key) => {
        const container = this.containers.get(key);
        return container ? [container] : [];
      });
      if (matches.length > 1) {
        throw new Error(
          `容器简称存在歧义：${parsed.name}；请写明 local 或 global 范围`,
        );
      }
      const match = matches[0];
      if (!match) throw new Error(`容器不存在：${parsed.name}`);
      return match;
    }
    if (!from && parsed.scope !== "global") {
      throw new Error(`容器访问缺少来源资源：${target}`);
    }
    const key = parsed.scope === "global"
      ? `global:${parsed.name}`
      : `local:${from!.plugin.id}:${parsed.name}`;
    const container = this.containers.get(key);
    if (!container) throw new Error(`容器不存在：${target}`);
    return container;
  }

  private resolveContainers(
    scope: PluginContainerScope,
    pattern: string,
    from: ResourceRecord,
  ) {
    const matcher = globMatcher(pattern);
    return [...this.containers.values()]
      .filter((container) =>
        container.scope === scope
        && (scope === "global" || container.source.plugin.id === from.plugin.id)
        && matcher.test(container.name)
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private createContainerValue(
    record: ContainerRecord,
    from: ResourceRecord,
  ): PluginContainerValue {
    const value: PluginContainerValue = {
      name: record.name,
      title: record.declaration.title,
      contentSuffixes: [...record.declaration.contentSuffixes],
      scope: record.scope,
      get: (path) => {
        const resource = record.resources.get(path)?.record;
        if (!resource) {
          throw new Error(`容器 ${record.name} 没有资源：${path}`);
        }
        this.tracedResourceIds.add(resource.file.id);
        return this.createImportedValue(from, resource);
      },
      list: () => ({
        resources: [...record.resources.keys()],
      }),
      toString: () =>
        `[Container ${record.scope}/${record.name}: ${
          [...record.resources.keys()].join(", ")
        }]`,
    };
    return Object.freeze(value);
  }

  private createContainerQuery(
    record: ContainerRecord,
    counts?: { usedByCount: number; contentCount: number },
  ): PluginContainerQuery {
    const usedByCount = counts?.usedByCount
      ?? this.records.filter(
        (item) => this.resourceUsesContainer(item, record),
      ).length;
    return {
      id: record.id,
      name: record.name,
      title: record.declaration.title,
      contentSuffixes: [...record.declaration.contentSuffixes],
      scope: record.scope,
      description: record.declaration.description?.trim() || undefined,
      pluginId: record.source.plugin.id,
      pluginName: record.source.plugin.name,
      definitionId: record.source.file.id,
      path: `/${record.source.path}`,
      usedByCount,
      contentCount: counts?.contentCount ?? record.resources.size,
    };
  }

  private createResourceQuery(
    record: ResourceRecord,
  ): PluginContainerResourceQuery {
    return {
      id: record.file.id,
      name: record.file.name,
      path: `/${record.path}`,
      type: pluginFileType(record.file.name),
      order: record.file.order,
      pluginId: record.plugin.id,
      pluginName: record.plugin.name,
    };
  }

  private resourceUsesContainer(
    resource: ResourceRecord,
    target: ContainerRecord,
  ) {
    return findPluginImportCalls(resource.declarationSource).some((call) => {
      if (call.kind !== "container" && call.kind !== "containers") return false;
      try {
        return call.kind === "container"
          ? this.resolveContainer(
              `container:${call.scope}/${call.name}`,
              resource,
            ).key === target.key
          : this.resolveContainers(call.scope, call.pattern, resource)
              .some((container) => container.key === target.key);
      } catch {
        return false;
      }
    });
  }

  private createResourceValue(record: ResourceRecord): GenerationResourceValue {
    const value: GenerationResourceValue = {
      id: record.file.id,
      name: record.file.name,
      icon: record.file.icon,
      content: record.file.content,
      order: record.file.order,
      pluginId: record.plugin.id,
      pluginName: record.plugin.name,
      path: record.path,
      type: pluginFileType(record.file.name),
      toString: () => this.renderResource(record.file.id),
    };
    this.resourceValues.add(value);
    return value;
  }

  private requireRecord(resourceId: string) {
    const record = this.recordsById.get(resourceId);
    if (!record) throw new Error(`资源不存在：${resourceId}`);
    return record;
  }

  private addDataDiagnostic(record: ResourceRecord, message: string) {
    if (this.diagnostics.some((item) =>
      item.pluginId === record.plugin.id
      && item.resourceId === record.file.id
      && item.message === message
    )) return;
    this.diagnostics.push({
      pluginId: record.plugin.id,
      resourceId: record.file.id,
      message,
    });
  }
}

export function createPluginReferenceResolver(
  plugins: Plugin[],
  options: PluginReferenceResolverOptions = {},
) {
  return new PluginReferenceResolver(plugins, options);
}

export function createPluginContainerQueryId(
  scope: PluginContainerScope,
  name: string,
  pluginId: string,
  directory = "",
) {
  return [
    "container",
    scope,
    encodeURIComponent(pluginId),
    encodeURIComponent(directory),
    encodeURIComponent(name.trim()),
  ].join(":");
}

function containerKey(
  scope: PluginContainerScope,
  name: string,
  record: ResourceRecord,
) {
  if (scope === "global") return `global:${name}`;
  return `local:${record.plugin.id}:${name}`;
}

function parentResourcePath(path: string) {
  const index = path.lastIndexOf("/");
  return index < 0 ? "" : path.slice(0, index);
}

function relativeResourcePath(directory: string, targetPath: string) {
  const from = directory.split("/").filter(Boolean);
  const target = targetPath.split("/").filter(Boolean);
  let common = 0;
  while (common < from.length && from[common] === target[common]) common += 1;
  const parts = [
    ...Array.from({ length: from.length - common }, () => ".."),
    ...target.slice(common),
  ];
  const path = parts.join("/");
  return path.startsWith(".") ? path : `./${path}`;
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

function globMatcher(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
