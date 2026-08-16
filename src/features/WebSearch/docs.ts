import type { FeatureDocs } from "@/features/Capabilities/types";

export const docs: FeatureDocs = {
  id: "webSearch",
  title: "网络搜索",
  description: "通过已启用的 Playwright Chromium 或 Exa 搜索提供商执行网页搜索，返回可引用的结果摘要。",
  documentation: {
    overview: "网络搜索在设置中选择已启用提供商：Playwright 使用 Rust 侧隔离的 headless Chromium，Exa 使用 Exa Search API。前端和 Sandbox 不接触浏览器、driver、WebDriver 或 API Key 明文。",
    notes: [
      "Playwright 仅支持桌面端，并要求已安装匹配版本的 Playwright Chromium。",
      "Exa API Key 保存为 Secret，并且只由原生请求层写入 x-api-key。",
      "移动端可使用已启用的 Exa；不提供浏览器自动化搜索。",
      "结果来自搜索结果页，调用方应在回答前按需打开并核实来源。",
    ],
    types: [{
      name: "WebSearchResult",
      description: "搜索结果的最小可序列化表示。",
      definition: `interface WebSearchResult {\n  title: string;\n  url: string;\n  snippet: string;\n}`,
    }],
  },
  api: [{
    name: "search",
    signature: "search(input: { query: string; limit?: number }): Promise<WebSearchResult[]>",
    description: "使用设置中的活动提供商执行关键词搜索，最多返回 10 条结果。",
    example: "await webSearch.search({ query: 'PulsarAI', limit: 5 })",
  }],
};
