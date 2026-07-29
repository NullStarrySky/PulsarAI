import {
  resolveSandboxText,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";

export type InteractiveValue =
  | string
  | number
  | boolean
  | null
  | InteractiveValue[]
  | { [key: string]: InteractiveValue };

export type InteractiveBlockType = "text" | "variable" | "component";
export type InteractiveBlockRole = "system" | "user" | "assistant";

export interface InteractiveBlockBase {
  id: string;
  type: InteractiveBlockType;
  name: string;
  description: string;
  hidden: boolean;
  role?: InteractiveBlockRole;
}

export interface InteractiveTextBlock extends InteractiveBlockBase {
  type: "text";
  content: string[];
  activeContentIndex: number;
  variableIds: string[];
}

export interface InteractiveVariableBlock extends InteractiveBlockBase {
  type: "variable";
  value: InteractiveValue;
  rendererId: string;
}

export interface InteractiveComponentBlock extends InteractiveBlockBase {
  type: "component";
  componentId: string;
  props: Record<string, InteractiveValue>;
  fallbackMarkdown: string;
}

export type InteractiveDocumentBlock =
  | InteractiveTextBlock
  | InteractiveVariableBlock
  | InteractiveComponentBlock;

export interface InteractiveDocumentData {
  id: string;
  name: string;
  description: string;
  blocks: InteractiveDocumentBlock[];
}

export interface InteractiveVariableRenderer {
  id: string;
  name: string;
  render(value: InteractiveValue): string;
}

export interface InteractiveDocumentCompileError {
  blockId: string;
  message: string;
}

export interface InteractiveDocumentCompileResult {
  markdown: string;
  errors: InteractiveDocumentCompileError[];
}

export type InteractiveComponentResolver = (
  block: InteractiveComponentBlock,
  environment: SandboxEnvironment,
) => string;

export interface InteractiveDocumentOptions {
  renderers?: InteractiveVariableRenderer[];
  componentResolver?: InteractiveComponentResolver;
}

export type CreateInteractiveBlockInput =
  | (Partial<Omit<InteractiveTextBlock, "type">> & { type: "text" })
  | (Partial<Omit<InteractiveVariableBlock, "type">> & { type: "variable" })
  | (Partial<Omit<InteractiveComponentBlock, "type">> & { type: "component" });

export type InteractiveDocumentBlockPatch =
  | Partial<Omit<InteractiveTextBlock, "id" | "type">>
  | Partial<Omit<InteractiveVariableBlock, "id" | "type">>
  | Partial<Omit<InteractiveComponentBlock, "id" | "type">>;

export const defaultInteractiveVariableRenderers: InteractiveVariableRenderer[] = [
  {
    id: "auto",
    name: "自动",
    render: renderAuto,
  },
  {
    id: "text",
    name: "纯文本",
    render: (value) => {
      if (typeof value === "string") {
        return value;
      }
      if (value == null) {
        return "";
      }
      return typeof value === "object" ? JSON.stringify(value) ?? "" : String(value);
    },
  },
  {
    id: "list",
    name: "Markdown 列表",
    render: renderList,
  },
  {
    id: "json",
    name: "JSON",
    render: (value) => JSON.stringify(value, null, 2) ?? "",
  },
  {
    id: "slider",
    name: "滑块",
    render: (value) => typeof value === "number" ? String(value) : "0",
  },
  {
    id: "toggle",
    name: "开关",
    render: (value) => value ? "true" : "false",
  },
];

export class InteractiveDocument {
  readonly data: InteractiveDocumentData;
  private readonly renderers = new Map<string, InteractiveVariableRenderer>();
  private readonly componentResolver?: InteractiveComponentResolver;

  constructor(data: InteractiveDocumentData, options: InteractiveDocumentOptions = {}) {
    this.data = data;
    this.componentResolver = options.componentResolver;
    for (const renderer of [...defaultInteractiveVariableRenderers, ...(options.renderers ?? [])]) {
      this.renderers.set(renderer.id, renderer);
    }
  }

  getBlock(blockId: string) {
    return this.data.blocks.find((block) => block.id === blockId);
  }

  createBlock(input: CreateInteractiveBlockInput): InteractiveDocumentBlock {
    const block = createInteractiveBlock(input);
    if (this.getBlock(block.id)) {
      throw new Error(`交互式文档块 id 已存在：${block.id}`);
    }
    this.data.blocks.push(block);
    return block;
  }

  updateBlock(
    blockId: string,
    patch: InteractiveDocumentBlockPatch,
  ) {
    const block = this.requireBlock(blockId);
    Object.assign(block, patch);
    normalizeBlock(block);
    return block;
  }

  deleteBlock(blockId: string) {
    const index = this.data.blocks.findIndex((block) => block.id === blockId);
    if (index < 0) {
      return false;
    }
    this.data.blocks.splice(index, 1);
    for (const block of this.data.blocks) {
      if (block.type === "text") {
        block.variableIds = block.variableIds.filter((id) => id !== blockId);
      }
    }
    return true;
  }

  setBlockHidden(blockId: string, hidden: boolean) {
    const block = this.requireBlock(blockId);
    block.hidden = hidden;
    return block;
  }

  moveBlock(blockId: string, targetIndex: number) {
    const currentIndex = this.data.blocks.findIndex((block) => block.id === blockId);
    if (currentIndex < 0) {
      return false;
    }
    const [block] = this.data.blocks.splice(currentIndex, 1);
    if (!block) {
      return false;
    }
    const nextIndex = Math.max(0, Math.min(targetIndex, this.data.blocks.length));
    this.data.blocks.splice(nextIndex, 0, block);
    return true;
  }

  setActiveTextContent(blockId: string, index: number) {
    const block = this.requireTextBlock(blockId);
    block.activeContentIndex = clampContentIndex(block, index);
    return block;
  }

  addTextContent(blockId: string, markdown = "") {
    const block = this.requireTextBlock(blockId);
    block.content.push(markdown);
    block.activeContentIndex = block.content.length - 1;
    return block.activeContentIndex;
  }

  updateTextContent(blockId: string, index: number, markdown: string) {
    const block = this.requireTextBlock(blockId);
    const normalizedIndex = clampContentIndex(block, index);
    block.content[normalizedIndex] = markdown;
    return block;
  }

  removeTextContent(blockId: string, index: number) {
    const block = this.requireTextBlock(blockId);
    if (block.content.length <= 1) {
      block.content[0] = "";
      block.activeContentIndex = 0;
      return block;
    }
    block.content.splice(clampContentIndex(block, index), 1);
    block.activeContentIndex = clampContentIndex(block, block.activeContentIndex);
    return block;
  }

  compileDetailed(): InteractiveDocumentCompileResult {
    const errors: InteractiveDocumentCompileError[] = [];
    const environment = this.createEnvironment();
    const sections: Array<{
      role: InteractiveBlockRole;
      markdown: string;
    }> = [];

    for (const block of this.data.blocks) {
      if (block.hidden || block.type === "variable") {
        continue;
      }

      if (block.type === "component") {
        const markdown = this.resolveComponentBlock(block, environment, errors);
        if (markdown.trim()) {
          sections.push({
            role: block.role ?? "assistant",
            markdown: markdown.trim(),
          });
        }
        continue;
      }

      const template = block.content[clampContentIndex(block, block.activeContentIndex)] ?? "";
      try {
        const scopedEnvironment = this.createTextBlockEnvironment(block, environment);
        const markdown = resolveSandboxText(template, [scopedEnvironment], {
          keepArraySet2StrDefault: true,
        });
        if (markdown.trim()) {
          sections.push({
            role: block.role ?? "assistant",
            markdown: markdown.trim(),
          });
        }
      } catch (error) {
        errors.push({
          blockId: block.id,
          message: error instanceof Error ? error.message : String(error),
        });
        if (template.trim()) {
          sections.push({
            role: block.role ?? "assistant",
            markdown: template.trim(),
          });
        }
      }
    }

    return {
      markdown: compileRoleSections(sections),
      errors,
    };
  }

  compile() {
    return this.compileDetailed().markdown;
  }

  toString() {
    return this.compile();
  }

  private createEnvironment(): SandboxEnvironment {
    const variables: Record<string, unknown> = {};
    const environment: SandboxEnvironment = {
      $variables: variables,
      variables,
    };

    for (const block of this.data.blocks) {
      if (block.type !== "variable" || block.hidden) {
        continue;
      }
      const renderer = this.renderers.get(block.rendererId) ?? this.renderers.get("auto");
      const binding = createRenderedBinding(block.value, renderer ?? defaultInteractiveVariableRenderers[0]!);
      variables[block.id] = binding;
      variables[block.name] = binding;
      environment[block.id] = binding;
      if (isSafeEnvironmentKey(block.name)) {
        environment[block.name] = binding;
      }
    }

    return environment;
  }

  private createTextBlockEnvironment(
    block: InteractiveTextBlock,
    environment: SandboxEnvironment,
  ): SandboxEnvironment {
    if (block.variableIds.length === 0) {
      return environment;
    }

    const scopedVariables: Record<string, unknown> = {};
    const scoped: SandboxEnvironment = {
      $variables: scopedVariables,
      variables: scopedVariables,
    };
    const allVariables = environment.$variables as Record<string, unknown>;

    for (const variableId of block.variableIds) {
      const variable = this.getBlock(variableId);
      if (!variable || variable.type !== "variable" || variable.hidden) {
        continue;
      }
      const binding = allVariables[variable.id];
      scopedVariables[variable.id] = binding;
      scopedVariables[variable.name] = binding;
      scoped[variable.id] = binding;
      if (isSafeEnvironmentKey(variable.name)) {
        scoped[variable.name] = binding;
      }
    }

    return scoped;
  }

  private resolveComponentBlock(
    block: InteractiveComponentBlock,
    environment: SandboxEnvironment,
    errors: InteractiveDocumentCompileError[],
  ) {
    try {
      const source = this.componentResolver
        ? this.componentResolver(block, environment)
        : block.fallbackMarkdown;
      return resolveSandboxText(source, [environment], {
        keepArraySet2StrDefault: true,
      });
    } catch (error) {
      errors.push({
        blockId: block.id,
        message: error instanceof Error ? error.message : String(error),
      });
      return block.fallbackMarkdown;
    }
  }

  private requireBlock(blockId: string) {
    const block = this.getBlock(blockId);
    if (!block) {
      throw new Error(`找不到交互式文档块：${blockId}`);
    }
    return block;
  }

  private requireTextBlock(blockId: string) {
    const block = this.requireBlock(blockId);
    if (block.type !== "text") {
      throw new Error(`块 ${blockId} 不是文本块`);
    }
    return block;
  }
}

export function createInteractiveDocument(
  data: InteractiveDocumentData,
  options: InteractiveDocumentOptions = {},
) {
  return new InteractiveDocument(data, options);
}

export function createInteractiveBlock(
  input: CreateInteractiveBlockInput,
): InteractiveDocumentBlock {
  const base = {
    id: input.id ?? crypto.randomUUID(),
    name: input.name?.trim() || defaultBlockName(input.type),
    description: input.description ?? "",
    hidden: input.hidden ?? false,
    role: input.role,
  };

  if (input.type === "text") {
    const block: InteractiveTextBlock = {
      ...base,
      type: "text",
      content: input.content?.length ? [...input.content] : [""],
      activeContentIndex: input.activeContentIndex ?? 0,
      variableIds: [...(input.variableIds ?? [])],
    };
    normalizeBlock(block);
    return block;
  }

  if (input.type === "variable") {
    return {
      ...base,
      type: "variable",
      value: cloneValue(input.value ?? ""),
      rendererId: input.rendererId ?? "auto",
    };
  }

  return {
    ...base,
    type: "component",
    componentId: input.componentId ?? "",
    props: cloneValue(input.props ?? {}),
    fallbackMarkdown: input.fallbackMarkdown ?? "",
  };
}

function normalizeBlock(block: InteractiveDocumentBlock) {
  block.name = block.name.trim() || defaultBlockName(block.type);
  if (block.type !== "text") {
    return;
  }
  if (block.content.length === 0) {
    block.content.push("");
  }
  block.activeContentIndex = clampContentIndex(block, block.activeContentIndex);
  block.variableIds = [...new Set(block.variableIds)];
}

function clampContentIndex(block: InteractiveTextBlock, index: number) {
  return Math.max(0, Math.min(Math.trunc(index), block.content.length - 1));
}

function defaultBlockName(type: InteractiveBlockType) {
  if (type === "text") {
    return "新文本块";
  }
  if (type === "variable") {
    return "新变量块";
  }
  return "新组件块";
}

function createRenderedBinding(
  value: InteractiveValue,
  renderer: InteractiveVariableRenderer,
): unknown {
  if (value == null) {
    return value;
  }
  if (typeof value !== "object" && (renderer.id === "auto" || renderer.id === "text")) {
    return value;
  }
  const binding = typeof value === "object"
    ? cloneValue(value) as InteractiveValue[] | Record<string, InteractiveValue>
    : Object(value);
  Object.defineProperty(binding, "toString", {
    configurable: true,
    enumerable: false,
    value: () => renderer.render(value),
  });
  if (typeof value !== "object") {
    Object.defineProperty(binding, "valueOf", {
      configurable: true,
      enumerable: false,
      value: () => value,
    });
  }
  return binding;
}

function renderAuto(value: InteractiveValue): string {
  if (value == null) {
    return "";
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderInlineValue(item)).join("\n");
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2) ?? "";
  }
  return String(value);
}

function renderList(value: InteractiveValue): string {
  if (Array.isArray(value)) {
    return value.map((item) => `- ${renderInlineValue(item)}`).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => `- **${key}**: ${renderInlineValue(item)}`)
      .join("\n");
  }
  return value == null ? "" : `- ${String(value)}`;
}

function renderInlineValue(value: InteractiveValue): string {
  if (value == null) {
    return "";
  }
  return typeof value === "object" ? JSON.stringify(value) ?? "" : String(value);
}

function cloneValue<T extends InteractiveValue | Record<string, InteractiveValue>>(value: T): T {
  const source = JSON.stringify(value);
  return JSON.parse(source ?? "null") as T;
}

function isSafeEnvironmentKey(key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key);
}

function compileRoleSections(
  sections: Array<{ role: InteractiveBlockRole; markdown: string }>,
) {
  const output: string[] = [];
  let activeRole: InteractiveBlockRole | null = null;
  for (const section of sections) {
    if (section.role !== activeRole) {
      output.push(`# ${section.role}_prompt`);
      activeRole = section.role;
    }
    output.push(section.markdown);
  }
  return output.join("\n\n");
}
