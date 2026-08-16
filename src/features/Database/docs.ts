import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "database",
  title: "数据库",
  description: "访问 Pulsar 本地数据库的底层记录。除诊断或迁移外应优先使用所属 Feature 的高层 API。",
  documentation: {
    overview: "这是 SurrealDB 记录层的通用逃生口，允许按表名直接读写值。它绕过所属 Feature 的业务校验，因此写入与删除默认被策略屏蔽。",
    notes: [
      "表名和记录结构不会在运行时替调用方推断，调用方必须掌握对应 Feature 的持久化契约。",
      "写入与删除方法默认从运行时对象移除，仅在明确授权的环境中按需放开。",
    ],
    types: [{
      name: "DatabaseRecord",
      description: "selectAll 返回的记录包装结构。",
      definition: `interface DatabaseRecord<T> {
  id: string;
  value: T;
}`,
    }],
  },
  api: [
    {
      name: "selectAll",
      signature: "selectAll<T>(table: string): Promise<Array<{ id: string | null; value: T }>>",
      description: "读取一个表中的全部记录。",
    },
    {
      name: "selectOne",
      signature: "selectOne<T>(table: string, id: string): Promise<T | null>",
      description: "按 id 读取单条记录。",
    },
    {
      name: "upsert",
      signature: "upsert<T>(table: string, id: string, value: T): Promise<void>",
      description: "新增或替换一条记录。",
    },
    {
      name: "remove",
      signature: "remove(table: string, id: string): Promise<void>",
      description: "删除一条记录。",
    },
  ],
};
