import type { GenerateImageResult } from "../../ai-sdk";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { generateNovelAIImages } from "./client";

const models = [
	{ id: "nai-diffusion-4-5-curated", name: "NAI Diffusion v4.5 Curated" },
	{ id: "nai-diffusion-4-5-full", name: "NAI Diffusion v4.5 Full" },
	{ id: "nai-diffusion-4-curated-preview", name: "NAI Diffusion v4 Curated" },
	{ id: "nai-diffusion-4-full", name: "NAI Diffusion v4 Full" },
	{ id: "nai-diffusion-3", name: "NAI Diffusion Anime v3" },
	{ id: "nai-diffusion-furry-3", name: "NAI Diffusion Furry v3" },
];

async function generateImage({
	modelId,
	options,
}: {
	modelId?: string;
	options: Record<string, unknown>;
}) {
	const result = await generateNovelAIImages({
		prompt: text(options.prompt),
		settings: options as any,
		model: modelId as any,
		count: number(options.n),
		seed: number(options.seed),
		signal: options.abortSignal as AbortSignal | undefined,
	});
	return imageResult(result.images, { novelai: { seed: result.seed } });
}
export const novelai: ProviderRegistration = {
	provider: {
		id: "novelai",
		name: "NovelAI",
		description: "NovelAI 图片生成 API。",
		icon: "novelai",
		enabled: false,
		params: {
			basic: [
				param("baseUrl", "https://image.novelai.net", "API 地址"),
				secret("novelai_IMAGE_API_KEY", "API Key"),
			],
			text: [],
			image: [
				param("width", 832, "宽度", true),
				param("height", 1216, "高度", true),
				param("steps", 28, "步数", true),
				param("guidance", 5.5, "引导强度", true),
				param("sampler", "k_euler_ancestral", "采样器"),
				param("negativePrompt", "", "反向提示词", true),
				param("addQualityTags", true, "自动质量标签"),
			],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: {
			...emptyModels(),
			image: models.map((item) => ({
				id: item.id,
				displayName: item.name,
				enabled: true,
			})),
		},
		requestOverride: { generateImage: "novelaiGenerateImage" },
	},
	functions: { novelaiGenerateImage: generateImage },
};
function text(value: unknown) {
	const result = typeof value === "string" ? value.trim() : "";
	if (!result) throw new Error("NovelAI 提示词不能为空。");
	return result;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function imageResult(
	images: GenerateImageResult["images"],
	providerMetadata: Record<string, unknown>,
): GenerateImageResult {
	return {
		image: images[0]!,
		images,
		calls: [],
		warnings: [],
		responses: [],
		providerMetadata:
			providerMetadata as GenerateImageResult["providerMetadata"],
		usage: {
			inputTokens: undefined,
			outputTokens: undefined,
			totalTokens: undefined,
		},
	};
}
