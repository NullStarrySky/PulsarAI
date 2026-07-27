import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import {
  deleteResourceFile,
  resourceDisplayUrl,
} from "./application/resource-file-service";

export const capabilities: CapabilityDefinition = {
  id: "resources",
  title: "通用资源文件",
  description: "处理资源文件 URL，或删除已经保存的资源文件。",
  subCaps: {
    all: "全部通用资源文件权限",
    read: "解析资源显示地址",
    delete: "删除资源文件",
  },
  api: {
    read: [{
      name: "displayUrl",
      signature: "displayUrl(fileUrl?: string): string",
      description: "把本地资源地址转换为可显示的 URL。",
      example: "resources.displayUrl(fileUrl)",
    }],
    delete: [{
      name: "deleteFile",
      signature: "deleteFile(fileUrl: string): Promise<void>",
      description: "删除一个已经保存的资源文件。",
      example: "await resources.deleteFile(fileUrl)",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? { displayUrl: resourceDisplayUrl } : {}),
  ...(granted.has("delete") ? { deleteFile: deleteResourceFile } : {}),
}));
