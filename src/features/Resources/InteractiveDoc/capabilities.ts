import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import {
  createInteractiveDocument,
  type InteractiveDocumentData,
} from "./domain/interactive-document";

export const capabilities: CapabilityDefinition = {
  id: "interactiveDoc",
  title: "交互式文档",
  description: "把可序列化的交互式文档数据编译为纯 Markdown。",
  subCaps: {
    all: "全部交互式文档权限",
    compile: "编译文档",
  },
  api: {
    compile: [{
      name: "compile",
      signature: "compile(document: InteractiveDocumentData): { markdown: string; errors: CompileError[] }",
      description: "解析变量与组件块并返回 Markdown 和逐块错误。",
      example: "interactiveDoc.compile(document)",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("compile") ? {
    compile: (document: InteractiveDocumentData) =>
      createInteractiveDocument(document).compileDetailed(),
  } : {}),
}));
