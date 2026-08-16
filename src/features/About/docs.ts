import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "about",
  title: "关于与环境检查",
  description: "读取本地开发工具的可用状态。",
  documentation: {
    overview: "用于诊断本机是否具备 Pulsar 外部工作流依赖的基础命令。目前检查 Node.js 与 Git，不执行安装或环境修复。",
    notes: [
      "检查通过 Tauri Shell 的预授权命令完成，不接受任意命令文本。",
      "未安装工具时仍返回完整状态对象，并通过 error 字段说明检测失败原因。",
    ],
    types: [{
      name: "EnvironmentToolStatus",
      description: "单个开发工具的检测结果。",
      definition: `type EnvironmentToolStatus = {
  id: "nodejs" | "git";
  name: string;
  version: string;
  installed: boolean;
  installPath: string;
  error: string;
};`,
    }],
  },
  api: [{
    name: "checkEnvironment",
    signature: "checkEnvironment(): Promise<EnvironmentToolStatus[]>",
    description: "检查应用已知的本地环境工具。",
    example: "await about.checkEnvironment()",
  }],
};
