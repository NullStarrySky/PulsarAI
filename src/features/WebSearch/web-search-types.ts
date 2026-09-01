export const EXA_API_KEY_SECRET = "webSearch.exa.apiKey";

export type WebSearchProviderId = "playwright" | "exa";

export interface WebSearchSettings {
	activeProviderId: WebSearchProviderId;
	playwrightEnabled: boolean;
	exaEnabled: boolean;
	resultLimit: number;
}

export function createDefaultWebSearchSettings(): WebSearchSettings {
	return {
		activeProviderId: "playwright",
		playwrightEnabled: true,
		exaEnabled: false,
		resultLimit: 5,
	};
}
