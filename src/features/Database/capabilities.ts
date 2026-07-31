import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { remove, selectAll, selectOne, upsert } from "./application/database-service";

export const capabilities: CapabilityDefinition = {
  id: "database",
  title: "数据库",
  description: "访问 Pulsar 本地数据库的底层记录。除诊断或迁移外应优先使用所属 Feature 的高层 API。",
  documentation: {
    overview: "这是 SurrealDB 记录层的通用逃生口，允许按表名直接读写值。它绕过所属 Feature 的业务校验，因此默认权限应保持保守。",
    notes: [
      "表名和记录结构不会在运行时替调用方推断，调用方必须掌握对应 Feature 的持久化契约。",
      "删除权限与写入权限分离，便于只允许迁移脚本新增或更新数据。",
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
  subCaps: {
    all: "全部数据库权限",
    read: "读取数据库记录",
    write: "写入数据库记录",
    delete: "删除数据库记录",
  },
  api: {
    read: [
      {
        name: "selectAll",
        signature: "selectAll<T>(table: string): Promise<Array<{ id: string; value: T }>>",
        description: "读取一个表中的全部记录。",
      },
      {
        name: "selectOne",
        signature: "selectOne<T>(table: string, id: string): Promise<T | null>",
        description: "按 id 读取单条记录。",
      },
    ],
    write: [{
      name: "upsert",
      signature: "upsert<T>(table: string, id: string, value: T): Promise<void>",
      description: "新增或替换一条记录。",
    }],
    delete: [{
      name: "remove",
      signature: "remove(table: string, id: string): Promise<void>",
      description: "删除一条记录。",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? { selectAll, selectOne } : {}),
  ...(granted.has("write") ? { upsert } : {}),
  ...(granted.has("delete") ? { remove } : {}),
}));
