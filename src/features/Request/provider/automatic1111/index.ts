import { host } from "@/host";
import type { GenerateImageResult } from "../../ai-sdk";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { generateAutomatic1111Images } from "./client";

async function generateImage({
	options,
}: {
	options: Record<string, unknown>;
}) {
	const result = await generateAutomatic1111Images({
		prompt: text(options.prompt),
		settings: options as any,
		count: number(options.n),
		seed: number(options.seed),
		signal: options.abortSignal as AbortSignal | undefined,
		useAuth: await host.secrets.has("automatic1111_BASIC_AUTH"),
	});
	return resultFor(result.images, { automatic1111: { seed: result.seed } });
}
export const automatic1111: ProviderRegistration = {
	provider: {
		id: "automatic1111",
		name: "AUTOMATIC1111 / Forge",
		description: "用户控制端点的 Stable Diffusion WebUI 服务。",
		icon: "automatic1111",
		enabled: false,
		params: {
			basic: [
				param("protocol", "http", "协议"),
				param("host", "127.0.0.1", "主机"),
				param("port", 7860, "端口"),
				secret("automatic1111_BASIC_AUTH", "基础认证"),
			],
			text: [],
			image: [
				param("model", "", "Checkpoint"),
				param("sampler", "Euler a", "采样器"),
				param("scheduler", "Automatic", "调度器"),
				param("width", 832, "宽度", true),
				param("height", 1216, "高度", true),
				param("steps", 28, "步数", true),
				param("cfg", 7, "CFG", true),
				param("negativePrompt", "", "反向提示词", true),
			],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: {
			...emptyModels(),
			image: [{ id: "txt2img", displayName: "txt2img", enabled: true }],
		},
		requestOverride: { generateImage: "automatic1111GenerateImage" },
	},
	functions: { automatic1111GenerateImage: generateImage },
};
function text(value: unknown) {
	const result = typeof value === "string" ? value.trim() : "";
	if (!result) throw new Error("A1111 提示词不能为空。");
	return result;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function resultFor(
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
