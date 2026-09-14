import type { GenerateImageResult } from "../../ai-sdk";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { generateStabilityImages } from "./client";

const models = [
	{ id: "stable-image-ultra", name: "Stable Image Ultra" },
	{ id: "stable-image-core", name: "Stable Image Core" },
	{ id: "stable-diffusion-3", name: "Stable Diffusion 3 / 3.5" },
];

async function generateImage({
	modelId,
	options,
}: {
	modelId?: string;
	options: Record<string, unknown>;
}) {
	const result = await generateStabilityImages({
		prompt: text(options.prompt),
		settings: options as any,
		model: modelId as any,
		count: number(options.n),
		seed: number(options.seed),
		signal: options.abortSignal as AbortSignal | undefined,
	});
	return imageResult(result.images, { stability: { model: modelId } });
}
export const stability: ProviderRegistration = {
	provider: {
		id: "stability",
		name: "Stability AI",
		description: "Stability 图片生成 API。",
		icon: "stability",
		enabled: false,
		params: {
			basic: [
				param("baseUrl", "https://api.stability.ai", "API 地址"),
				secret("stability_API_KEY", "API Key"),
			],
			text: [],
			image: [
				param("aspectRatio", "2:3", "宽高比", true),
				param("outputFormat", "png", "输出格式"),
				param("negativePrompt", "", "反向提示词", true),
				param("stylePreset", "", "风格预设"),
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
		requestOverride: { generateImage: "stabilityGenerateImage" },
	},
	functions: { stabilityGenerateImage: generateImage },
};
function text(value: unknown) {
	const result = typeof value === "string" ? value.trim() : "";
	if (!result) throw new Error("Stability 提示词不能为空。");
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
