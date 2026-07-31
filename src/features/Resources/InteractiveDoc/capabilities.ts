import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import {
  compileInteractiveDocumentSource,
} from "./domain/interactive-document";

export const capabilities: CapabilityDefinition = {
  id: "interactiveDoc",
  title: "交互式文档",
  description: "把 SFC 风格的交互式文档源码编译为角色消息和 Markdown。",
  documentation: {
    overview: "解析 .imd 源码中的 prompt_template、data、sub_data 与显式资源引用，生成可加入上下文的角色消息和可预览 Markdown。",
    notes: [
      "编译过程不会隐式扫描资源，外部数据必须通过显式引用进入。",
      "返回 errors 时调用方应先展示或处理诊断，再决定是否使用部分编译结果。",
    ],
    types: [
      {
        name: "InteractiveValue",
        description: "交互式文档本地 data 可以安全保存的递归值。",
        definition: `type InteractiveValue =
  | string
  | number
  | boolean
  | null
  | InteractiveValue[]
  | { [key: string]: InteractiveValue };`,
      },
      {
        name: "InteractiveDocumentCompileResult",
        description: "一次交互式文档编译的完整结果。",
        definition: `interface InteractiveDocumentCompileResult {
  messages: ModelMessage[];
  markdown: string;
  data: Record<string, InteractiveValue>;
  errors: InteractiveDocumentCompileError[];
  dependencies: string[];
}`,
      },
      {
        name: "InteractiveDocumentCompileError",
        description: "指向源文档问题的结构化诊断。",
        definition: `interface InteractiveDocumentCompileError {
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
      signature: "compile(source: string): InteractiveDocumentCompileResult",
      description: "解析 prompt_template、本地 sub_data 与显式引用并返回编译结果。",
      example: "interactiveDoc.compile(source)",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("compile") ? {
    compile: (source: string) => compileInteractiveDocumentSource(source),
  } : {}),
}));
