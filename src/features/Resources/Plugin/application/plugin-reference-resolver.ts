import type { ModelMessage } from "ai";
import {
  compileContextDocumentSource,
  createContextDataFacade,
  type ContextDocumentDataBinding,
  type ContextDocumentCompileOptions,
  type ContextDocumentCompileResult,
  type ContextDataValue,
} from "@/features/Resources/InteractiveDoc/domain/interactive-document";
import {
  parsePluginDataDefinition,
  pluginDataInstanceKey,
  type PluginDataIsolation,
} from "@/features/Resources/Plugin/domain/plugin-data";
import {
  manifestValueAt,
  parsePluginManifest,
  parsePluginManifestReference,
  type PluginManifestValue,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import {
  createSandboxFunction,
  resolveSandboxText,
  stringifySandboxValue,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import {
  findPluginReferenceTokens,
  parsePluginContainerDefinitions,
  normalizePluginReferenceTarget,
  parseContainerReferenceTarget,
  replacePluginReferenceTokens,
  type PluginContainerDeclaration,
  type PluginContainerDelivery,
  type PluginContainerQueryScope,
  type PluginContainerScope,
  type PluginReferenceSuggestion,
} from "@/features/Resources/Plugin/domain/plugin-reference";
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
  priority: number;
  pluginId: string;
  pluginName: string;
  path: string;
  type: ReturnType<typeof pluginFileType>;
  contextConfig?: PluginFile["contextConfig"];
  toString(): string;
}

export interface PluginContainerValue {
  readonly name: string;
  readonly scope: PluginContainerQueryScope;
  get(alias: string): GenerationResourceValue;
  use(alias: string): PluginContainerValue;
  list(): {
    resources: string[];
    containers: string[];
  };
  toString(): string;
}

export interface PluginContainerResourceQuery {
  id: string;
  name: string;
  path: string;
  type: ReturnType<typeof pluginFileType>;
  priority: number;
  pluginId: string;
  pluginName: string;
}

export interface PluginContainerContentQuery extends PluginContainerResourceQuery {
  alias: string;
  condition?: PluginFile["memberships"][number]["condition"];
}

export interface PluginContainerQuery {
  id: string;
  name: string;
  scope: PluginContainerQueryScope;
  description?: string;
  delivery?: PluginContainerDelivery;
  deliveryFunctions?: {
    extractor?: PluginContainerResourceQuery;
    transformer?: PluginContainerResourceQuery;
  };
  depth?: number;
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

export interface PluginContainerRetrieveInput {
  query?: string;
  resourceIds?: string[];
  limit?: number;
}

export interface PluginContainerRetrieveResult {
  containerId: string;
  containerPath: string;
  query?: string;
  contents: PluginContainerContentQuery[];
  value: unknown;
}

export interface ResolvedPluginDataBinding extends ContextDocumentDataBinding {
  isolation: PluginDataIsolation;
}

export interface PluginDataReferenceQuery {
  alias: string;
  dataId: string;
  resourceId: string;
  path: string;
  isolation: PluginDataIsolation;
  writable: boolean;
  pluginId: string;
  pluginName: string;
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
  scope: PluginContainerQueryScope;
  declaration: PluginContainerDeclaration | {
    name: string;
    scope: "depth";
    description: string;
    imports: [];
  };
  source: ResourceRecord;
  depth?: number;
  resources: Map<string, {
    record: ResourceRecord;
    membership: PluginFile["memberships"][number];
  }>;
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

  resolveFromResource(resourceId: string, target: string) {
    const record = this.recordsById.get(resourceId);
    if (!record) {
      throw new Error(`引用来源不存在：${resourceId}`);
    }
    return this.resolve(target, record);
  }

  referenceSuggestionsFromResource(
    resourceId: string,
  ): PluginReferenceSuggestion[] {
    const from = this.requireRecord(resourceId);
    const visible = [...this.containers.values()].filter((container) =>
      container.scope === "global"
      || (
        container.source.plugin.id === from.plugin.id
        && (
          container.scope === "plugin"
          || container.source.directory === from.directory
        )
      )
    );
    const nameCounts = new Map<string, number>();
    for (const container of visible) {
      nameCounts.set(container.name, (nameCounts.get(container.name) ?? 0) + 1);
    }
    const containerSuggestions = visible.map((container) => ({
      target:
        nameCounts.get(container.name) === 1
          ? container.name
          : `container:${container.scope}/${container.name}`,
      label: container.name,
      detail: `${container.scope} · ${container.source.plugin.name}`,
      description: container.declaration.description?.trim() || undefined,
    }));
    const configSuggestions = this.plugins.flatMap((plugin) => {
      if (plugin.id !== from.plugin.id && plugin.packageId !== null) return [];
      const record = this.manifestRecord(plugin.id);
      if (!record) return [];
      const parsed = parsePluginManifest(record.file.content);
      return parsed.manifest.flatMap((groupContent) =>
        groupContent.content.map((content) => ({
          target: plugin.id === from.plugin.id
            ? `config:local/${groupContent.group.id}/${content.id}`
            : `config:global/${plugin.id}/${groupContent.group.id}/${content.id}`,
          label: content.title,
          detail: `${groupContent.group.title} · ${plugin.name}`,
          description: content.description,
        }))
      );
    });
    return [...containerSuggestions, ...configSuggestions];
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
      ([alias, entry]) => ({
        alias,
        ...this.createResourceQuery(entry.record),
        ...(entry.membership.condition
          ? { condition: structuredClone(entry.membership.condition) }
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

  async retrieveContainer(
    containerId: string,
    input: PluginContainerRetrieveInput = {},
  ): Promise<PluginContainerRetrieveResult> {
    const container = [...this.containers.values()].find(
      (item) => item.id === containerId,
    );
    if (!container) throw new Error(`容器不存在：${containerId}`);
    const entries = [...container.resources.entries()].map(([alias, entry]) => ({
      alias,
      entry,
      query: {
        alias,
        ...this.createResourceQuery(entry.record),
        ...(entry.membership.condition
          ? { condition: structuredClone(entry.membership.condition) }
          : {}),
      } satisfies PluginContainerContentQuery,
    }));
    const delivery = "delivery" in container.declaration
      ? container.declaration.delivery
      : undefined;
    const configuredLimit = delivery?.max_results ?? 8;
    const limit = Math.min(
      configuredLimit,
      Math.max(1, Math.trunc(input.limit ?? configuredLimit)),
    );
    let selectionProvided = input.resourceIds !== undefined;
    let selectedIds = [...new Set(
      (input.resourceIds ?? []).map((item) => item.trim()).filter(Boolean),
    )];
    if (!selectionProvided && delivery?.extractor) {
      const extractor = this.createContainerFunction(container, delivery.extractor);
      const result = await extractor({
        container: this.createContainerQuery(container),
        query: input.query?.trim() || undefined,
        limit,
        contents: entries.map((item) => item.query),
      });
      selectedIds = normalizeExtractorResourceIds(result);
      selectionProvided = true;
    }
    if (!selectionProvided) {
      const needle = input.query?.trim().toLocaleLowerCase() ?? "";
      selectedIds = entries
        .filter((item) =>
          !needle
          || [item.alias, item.entry.record.file.name, item.entry.record.path]
            .some((value) => value.toLocaleLowerCase().includes(needle))
        )
        .slice(0, limit)
        .map((item) => item.entry.record.file.id);
    }
    const allowedIds = new Set(entries.map((item) => item.entry.record.file.id));
    const invalidId = selectedIds.find((id) => !allowedIds.has(id));
    if (invalidId) {
      throw new Error(`提取器返回了容器之外的资源：${invalidId}`);
    }
    const selected = selectedIds.slice(0, limit).map((id) =>
      entries.find((item) => item.entry.record.file.id === id)!
    );
    const resources = selected.map((item) => ({
      ...item.query,
      content: this.renderResource(item.entry.record.file.id),
    }));
    const value = delivery?.transformer
      ? await this.createContainerFunction(container, delivery.transformer)({
          container: this.createContainerQuery(container),
          query: input.query?.trim() || undefined,
          resources: structuredClone(resources),
        })
      : resources;
    return {
      containerId,
      containerPath: this.createContainerQuery(container).path,
      ...(input.query?.trim() ? { query: input.query.trim() } : {}),
      contents: selected.map((item) => item.query),
      value,
    };
  }

  compileDepthContainerMessages(): Array<{
    depth: number;
    containerId: string;
    messages: ModelMessage[];
  }> {
    return [...this.containers.values()]
      .filter((container) => container.scope === "depth" && container.depth != null)
      .sort((a, b) => b.depth! - a.depth!)
      .map((container) => ({
        depth: container.depth!,
        containerId: container.id,
        messages: [...container.resources.values()].flatMap(({ record }) => {
          const type = pluginFileType(record.file.name);
          if (type === "markdown") {
            return this.compileContextDocument(record.file.id).messages;
          }
          if (type === "text" || type === "component") {
            return [{
              role: "system" as const,
              content: this.renderResource(record.file.id),
            }];
          }
          this.diagnostics.push({
            pluginId: record.plugin.id,
            resourceId: record.file.id,
            message: `深度容器只接受 Markdown、文本或组件资源：${record.path}`,
          });
          return [];
        }),
      }));
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
    if (normalized.startsWith("config:")) {
      return this.resolveManifestValue(normalized, from);
    }
    if (normalized.startsWith("container:")) {
      const container = this.resolveContainer(normalized, from);
      return this.createContainerValue(container);
    }
    throw new Error(`不支持的引用：${normalized}`);
  }

  compileContextDocument(
    resourceId: string,
    options: Pick<ContextDocumentCompileOptions, "dataOverrides"> = {},
  ): ContextDocumentCompileResult {
    const record = this.requireRecord(resourceId);
    if (pluginFileType(record.file.name) !== "markdown") {
      throw new Error(`上下文资源不是 Markdown：${record.path}`);
    }
    this.tracedResourceIds.add(record.file.id);
    if (options.dataOverrides) this.setDataOverrides(options.dataOverrides);
    const result = compileContextDocumentSource(record.declarationSource, {
      environment: this.environment,
      dataOverrides: options.dataOverrides,
      dataBindings: this.dataBindingsForResource(record.file.id),
      resolveReference: (target) => this.resolve(target, record),
    });
    this.addCompileDiagnostics(record, result);
    return result;
  }

  dataBindingsForResource(resourceId: string): ResolvedPluginDataBinding[] {
    const record = this.requireRecord(resourceId);
    const aliases = new Set<string>();
    return (record.file.dataReferences ?? []).flatMap((reference) => {
      const alias = reference.alias.trim();
      if (!alias) {
        this.addDataDiagnostic(record, "数据引用 alias 不能为空。");
        return [];
      }
      if (aliases.has(alias)) {
        this.addDataDiagnostic(record, `数据引用 alias 重复：${alias}`);
        return [];
      }
      aliases.add(alias);
      const target = this.recordsById.get(reference.dataId);
      if (!target) {
        this.addDataDiagnostic(record, `Data 资源不存在：${reference.dataId}`);
        return [];
      }
      if (pluginFileType(target.file.name) !== "data") {
        this.addDataDiagnostic(record, `引用目标不是 .data：${target.path}`);
        return [];
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
        record.file.id,
      );
      return [{
        alias,
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

  getDataReferences(resourceId: string): PluginDataReferenceQuery[] {
    return this.dataBindingsForResource(resourceId).map((binding) => ({
      alias: binding.alias,
      dataId: binding.dataId,
      resourceId: binding.resourceId,
      path: binding.path,
      isolation: binding.isolation,
      writable: binding.enableUpdater === true,
      pluginId: binding.pluginId,
      pluginName: binding.pluginName,
    }));
  }

  listDataBindings(): ResolvedPluginDataBinding[] {
    return this.records.flatMap((record) =>
      this.dataBindingsForResource(record.file.id)
    );
  }

  prepareJavaScript(resourceId: string) {
    const record = this.requireRecord(resourceId);
    this.tracedResourceIds.add(record.file.id);
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
    return resolveSandboxText(prepared, [{
      ...this.environment,
      data,
      DATA: data,
      ref,
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
          id: createPluginContainerQueryId(
            declaration.scope,
            declaration.name,
            record.plugin.id,
            record.directory,
          ),
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

    for (
      const record of [...this.records].sort(
        (a, b) =>
          b.file.priority - a.file.priority
          || a.plugin.id.localeCompare(b.plugin.id)
          || a.path.localeCompare(b.path)
          || a.file.id.localeCompare(b.file.id),
      )
    ) {
      for (const membership of record.file.memberships ?? []) {
        try {
          if (!this.membershipEnabled(record, membership.condition)) continue;
          const parsedTarget = parseContainerReferenceTarget(
            membership.container,
          );
          if (parsedTarget.scope === "depth") {
            this.ensureDepthContainer(Number(parsedTarget.name), record);
          }
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
          container.resources.set(alias, { record, membership });
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

  private membershipEnabled(
    record: ResourceRecord,
    condition: PluginFile["memberships"][number]["condition"],
  ) {
    if (!condition?.reference.trim()) return true;
    const reference = parsePluginManifestReference(condition.reference);
    if (reference.scope !== "local") {
      throw new Error("容器成员注入条件只允许引用 config:local/group/content。");
    }
    const value = this.resolveManifestValue(condition.reference, record);
    return Object.prototype.hasOwnProperty.call(condition, "equals")
      ? manifestValuesEqual(value, condition.equals ?? null)
      : Boolean(value);
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
    if (parsed.scope === "depth") {
      const container = this.containers.get(`depth:${parsed.name}`);
      if (!container) throw new Error(`深度容器不存在或没有内容：${normalized}`);
      return container;
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

  private ensureDepthContainer(depth: number, source: ResourceRecord) {
    const key = `depth:${depth}`;
    if (this.containers.has(key)) return this.containers.get(key)!;
    const container: ContainerRecord = {
      id: `container:depth/${depth}`,
      key,
      name: String(depth),
      scope: "depth",
      depth,
      declaration: {
        name: String(depth),
        scope: "depth",
        description: `在最终上下文倒数第 ${depth} 个消息边界插入；0 表示底部。`,
        imports: [],
      },
      source,
      resources: new Map(),
      imports: new Map(),
    };
    this.containers.set(key, container);
    return container;
  }

  private createContainerFunction(
    container: ContainerRecord,
    rawReference: string,
  ) {
    const target = rawReference.trim().replace(/^<@|>$/g, "");
    const value = this.resolve(target, container.source);
    if (!this.isResourceValue(value) || value.type !== "javascript") {
      throw new Error(`容器函数必须引用 JavaScript 资源：${rawReference}`);
    }
    const prepared = this.prepareJavaScript(value.id);
    return createSandboxFunction(prepared.source, [prepared.environment]);
  }

  private createContainerValue(record: ContainerRecord): PluginContainerValue {
    if (record.value) return record.value;
    const value: PluginContainerValue = {
      name: record.name,
      scope: record.scope,
      get: (alias) => {
        const resource = record.resources.get(alias)?.record;
        if (!resource) {
          throw new Error(`容器 ${record.name} 没有资源：${alias}`);
        }
        this.tracedResourceIds.add(resource.file.id);
        return this.createResourceValue(resource);
      },
      use: (alias) => {
        const imported = record.imports.get(alias);
        if (!imported) {
          throw new Error(`容器 ${record.name} 没有引用该命名空间：${alias}`);
        }
        return this.createContainerValue(imported);
      },
      list: () => ({
        resources: [...record.resources.keys()],
        containers: [...record.imports.keys()],
      }),
      toString: () =>
        this.containerDescription(record),
    };
    record.value = Object.freeze(value);
    return record.value;
  }

  private containerDescription(record: ContainerRecord) {
    const delivery = "delivery" in record.declaration
      ? record.declaration.delivery
      : undefined;
    const aliases = [...record.resources.keys()];
    if (delivery?.mode !== "on_demand") {
      return `[Container ${record.scope}/${record.name}: ${aliases.join(", ")}]`;
    }
    const query = this.createContainerQuery(record);
    return [
      `容器：${query.name}`,
      `ID：${query.id}`,
      `说明：${query.description ?? "未提供说明"}`,
      `数量：${query.contentCount}`,
      ...(delivery.index === "members"
        ? ["成员：", ...[...record.resources.entries()].map(
            ([alias, entry]) =>
              `- ${alias} · ${entry.record.file.id} · /${entry.record.path} · ${entry.record.plugin.name}`,
          )]
        : []),
      `需要完整内容时，在 codeAct 中调用 ctx.containers.retrieve(${JSON.stringify(query.id)}, { query, resourceIds?, limit? })。`,
    ].join("\n");
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
      scope: record.scope,
      description: record.declaration.description?.trim() || undefined,
      ...("delivery" in record.declaration && record.declaration.delivery
        ? { delivery: structuredClone(record.declaration.delivery) }
        : {}),
      ...("delivery" in record.declaration && record.declaration.delivery
        ? {
            deliveryFunctions: Object.fromEntries(
              (["extractor", "transformer"] as const).flatMap((kind) => {
                const reference = record.declaration.delivery?.[kind];
                if (!reference) return [];
                const resource = this.containerFunctionResource(record, reference);
                return resource ? [[kind, resource]] : [];
              }),
            ),
          }
        : {}),
      ...(record.depth != null ? { depth: record.depth } : {}),
      pluginId: record.source.plugin.id,
      pluginName: record.source.plugin.name,
      definitionId: record.scope === "depth" ? "" : record.source.file.id,
      path: record.scope === "depth"
        ? `container:depth/${record.depth}`
        : `/${record.source.path}`,
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
      ...(record.file.contextConfig
        ? { contextConfig: structuredClone(record.file.contextConfig) }
        : {}),
      priority: record.file.priority,
      pluginId: record.plugin.id,
      pluginName: record.plugin.name,
    };
  }

  private containerFunctionResource(
    container: ContainerRecord,
    rawReference: string,
  ) {
    try {
      const target = rawReference.trim().replace(/^<@|>$/g, "");
      const value = this.resolve(target, container.source);
      if (!this.isResourceValue(value) || value.type !== "javascript") {
        throw new Error(`容器函数必须引用 JavaScript 资源：${rawReference}`);
      }
      return this.createResourceQuery(this.requireRecord(value.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!this.diagnostics.some((item) =>
        item.pluginId === container.source.plugin.id
        && item.resourceId === container.source.file.id
        && item.message === message
      )) {
        this.diagnostics.push({
          pluginId: container.source.plugin.id,
          resourceId: container.source.file.id,
          message,
        });
      }
      return null;
    }
  }

  private resourceUsesContainer(
    resource: ResourceRecord,
    target: ContainerRecord,
  ) {
    return findPluginReferenceTokens(resource.declarationSource).some((token) => {
      try {
        const normalized = normalizePluginReferenceTarget(token.target);
        return normalized.startsWith("container:")
          && this.resolveContainer(normalized, resource).key === target.key;
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
      priority: record.file.priority,
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

  private addCompileDiagnostics(
    record: ResourceRecord,
    result: ContextDocumentCompileResult,
  ) {
    for (const error of result.errors) {
      this.diagnostics.push({
        pluginId: record.plugin.id,
        resourceId: record.file.id,
        message: `${record.path} (${error.sourceId})：${error.message}`,
      });
    }
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

function manifestValuesEqual(
  left: PluginManifestValue,
  right: PluginManifestValue,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeExtractorResourceIds(value: unknown) {
  const ids = Array.isArray(value)
    ? value
    : value && typeof value === "object" && "resourceIds" in value
      ? (value as { resourceIds?: unknown }).resourceIds
      : null;
  if (!Array.isArray(ids) || ids.some((item) => typeof item !== "string")) {
    throw new Error("容器提取器必须返回 string[] 或 { resourceIds: string[] }。");
  }
  return [...new Set(ids.map((item) => item.trim()).filter(Boolean))];
}
