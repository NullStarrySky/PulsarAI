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
  subCaps: {
    all: "全部交互式文档权限",
    compile: "编译文档",
  },
  api: {
    compile: [{
      name: "compile",
      signature: "compile(source: string): { messages: ModelMessage[]; markdown: string; errors: CompileError[] }",
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
