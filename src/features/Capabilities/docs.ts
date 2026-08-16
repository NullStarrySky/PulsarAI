import type { FeatureDocs } from "./types";

export const docs: FeatureDocs = {
  id: "docs",
  title: "Feature API 文档",
  description: "查询当前 Feature API 注册表公开的 Feature 与函数元数据。",
  documentation: {
    overview: "提供注册表自身的只读元数据；公开 API 始终可用，少数特殊操作由运行时策略封锁。",
    notes: [
      "list、get、read_docs 与人类文档使用同一份定义。",
      "被策略封锁的函数不会出现在普通生成运行时中。",
    ],
    types: [
      {
        name: "FeatureApiDoc",
        description: "一个公开函数的人类与模型共用说明。",
        definition: `interface FeatureApiDoc {
  name: string;
  signature: string;
  description: string;
  returns?: string;
  example?: string;
}`,
      },
      {
        name: "FeatureDocs",
        description: "一个 Feature 的完整文档与 API 元数据。",
        definition: `interface FeatureDocs {
  id: string;
  title: string;
  description: string;
  documentation?: FeatureDocsDetail;
  api: FeatureApiDoc[];
}`,
      },
      {
        name: "ReadDocsResult",
        description: "read_docs 根据参数返回目录、完整 Feature 定义、单个函数契约或 null。",
        definition: `type ReadDocsResult =
  | FeatureDocsEntry[]
  | FeatureDocsResult
  | FeatureApiDocResult
  | null;`,
      },
    ],
  },
  api: [
    {
      name: "list",
      signature: "list(): Promise<FeatureDocs[]>",
      description: "列出全部 Feature 的文档和 API 元数据。",
      example: "await docs.list()",
    },
    {
      name: "get",
      signature: "get(featureId: string): Promise<FeatureDocs | null>",
      description: "按 Feature id 查询文档和 API 元数据。",
      example: "await docs.get('conversation')",
    },
    {
      name: "read_docs",
      signature: "read_docs(featureId?: string, apiName?: string): ReadDocsResult",
      description: "按需读取 Sandbox 中公开 Feature API 的目录、完整定义或单个函数契约。省略 featureId 返回目录；指定 featureId 返回该 Feature 的文档、类型、API 与可用状态；再指定 apiName 返回单个函数。",
      returns: "目录项数组、含每个函数 availability 的完整 Feature 定义、单个函数契约；未找到 Feature 或函数时返回 null。",
      example: "const api = read_docs('conversation', 'requestContainer');",
    },
  ],
};
