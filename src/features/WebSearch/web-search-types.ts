import type { Exa, SearchResponse } from "exa-js";

export const EXA_API_KEY_SECRET = "webSearch.exa.apiKey";

export type WebSearchProviderId = "playwright" | "exa";

export interface WebSearchSettings {
  activeProviderId: WebSearchProviderId;
  playwrightEnabled: boolean;
  exaEnabled: boolean;
  resultLimit: number;
}

/**
 * Keeps our normalized native provider aligned with the installed ExaJS search
 * contract, without moving the Secret-backed API key into the webview.
 */
export type ExaJsSearchResponse = Awaited<ReturnType<Exa["search"]>>;
export type ExaJsSearchResult = ExaJsSearchResponse extends SearchResponse<infer Contents>
  ? SearchResponse<Contents>["results"][number]
  : never;

export function createDefaultWebSearchSettings(): WebSearchSettings {
  return {
    activeProviderId: "playwright",
    playwrightEnabled: true,
    exaEnabled: false,
    resultLimit: 5,
  };
}
