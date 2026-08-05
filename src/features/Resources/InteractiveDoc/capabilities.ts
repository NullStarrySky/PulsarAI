import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import {
  compileContextDocumentSource,
} from "./domain/interactive-document";

export const capabilities: CapabilityDefinition = {
  id: "contextDocument",
  title: "上下文文档",
  description: "把带 Pulsar 角色围栏的 Markdown 编译为角色消息。",
  documentation: {
    overview: "解析普通 Markdown、:::pulsar role=... 角色围栏与同构 imports 调用，生成可加入上下文的角色消息。依赖由字面量调用静态发现，不维护资源引用元数据。",
    notes: [
      "编译过程静态扫描 imports.resource(...) 与 imports.resourceById(...) 字面量；导入 .data 时由 Plugin resolver 在运行时完成水合。",
      "返回 errors 时调用方应先展示或处理诊断，再决定是否使用部分编译结果。",
    ],
    types: [
      {
        name: "ContextDataValue",
        description: ".data 可以安全保存的递归值。",
        definition: `type ContextDataValue =
  | string
  | number
  | boolean
  | null
  | ContextDataValue[]
  | { [key: string]: ContextDataValue };`,
      },
      {
        name: "ContextDocumentCompileResult",
        description: "一次交互式文档编译的完整结果。",
        definition: `interface ContextDocumentCompileResult {
  messages: ModelMessage[];
  markdown: string;
  data: Record<string, ContextDataValue>;
  errors: ContextDocumentCompileError[];
  dependencies: string[];
}`,
      },
      {
        name: "ContextDocumentCompileError",
        description: "指向源文档问题的结构化诊断。",
        definition: `interface ContextDocumentCompileError {
  sourceId: string;
  message: string;
}`,
      },
    ],
  },
  subCaps: {
    all: "全部交互式文档权限",
    compile: "编译文档",
  },
  api: {
    compile: [{
      name: "compile",
      signature: "compile(source: string): ContextDocumentCompileResult",
      description: "解析角色围栏 Markdown 与 imports 调用并返回编译结果。",
      example: "contextDocument.compile(source)",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("compile") ? {
    compile: (source: string) => compileContextDocumentSource(source),
  } : {}),
}));
