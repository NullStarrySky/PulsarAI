import type {
	ModelDefinition,
	ModelProviderDefinition,
} from "../model-provider";
import { modelProxyFetch } from "../providers/model-proxy-fetch";

interface OpenAICompatibleModel {
	id?: string;
}

interface OpenAICompatibleModelsResponse {
	data?: OpenAICompatibleModel[];
}

export async function fetchOpenAICompatibleModels(
	provider: ModelProviderDefinition,
): Promise<ModelDefinition[]> {
	const baseUrl = provider.baseUrl.replace(/\/+$/, "");
	if (!baseUrl) {
		throw new Error("请先填写 API 代理地址。");
	}

	const response = await modelProxyFetch(`${baseUrl}/models`, {
		headers: {
			Authorization: `Bearer <<${provider.apiKeyName}>>`,
		},
	});

	if (!response.ok) {
		throw new Error(`获取模型列表失败：${response.status}`);
	}

	const payload = (await response.json()) as OpenAICompatibleModelsResponse;

	return (payload.data ?? [])
		.map((model) => model.id?.trim())
		.filter((id): id is string => Boolean(id))
		.map((id) => ({
			id,
			name: id,
			apiType: "chat",
			enabled: true,
		}));
}
