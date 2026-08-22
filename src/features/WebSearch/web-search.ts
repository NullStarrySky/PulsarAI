import { host } from "@/host";
import { loadWebSearchSettings } from "./web-search-settings";
import type { WebSearchProviderId } from "./web-search-types";

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(
  query: string,
  limit?: number,
  provider?: WebSearchProviderId,
) {
  const settings = await loadWebSearchSettings();
  const selectedProvider = provider ?? settings.activeProviderId;
  if (selectedProvider === "playwright" && !settings.playwrightEnabled) {
    throw new Error("Playwright 浏览器搜索未启用。");
  }
  if (selectedProvider === "exa" && !settings.exaEnabled) {
    throw new Error("Exa 搜索未启用。");
  }
  return host.network.webSearch<WebSearchResult[]>({
      query,
      limit: limit ?? settings.resultLimit,
      provider: selectedProvider,
  });
}
