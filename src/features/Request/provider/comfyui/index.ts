import type { GenerateImageResult } from "../../ai-sdk";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { generateComfyUIImages } from "./client";

async function generateImage({
	options,
}: {
	options: Record<string, unknown>;
}) {
	const result = await generateComfyUIImages({
		prompt: text(options.prompt),
		settings: options as any,
		count: number(options.n),
		seed: number(options.seed),
		signal: options.abortSignal as AbortSignal | undefined,
	});
	return imageResult(result.images, {
		comfyui: { promptId: result.promptId, seed: result.seed },
	});
}
export const comfyui: ProviderRegistration = {
	provider: {
		id: "comfyui",
		name: "ComfyUI",
		description: "ComfyUI 或 RunPod Serverless 工作流。",
		icon: "comfyui",
		enabled: false,
		params: {
			basic: [
				param("serverType", "standard", "服务类型"),
				param("protocol", "http", "协议"),
				param("host", "127.0.0.1", "主机"),
				param("port", 8188, "端口"),
				param("runpodEndpointUrl", "", "RunPod Endpoint URL"),
				param("timeoutSeconds", 120, "超时（秒）"),
				secret("comfyui_RUNPOD_API_KEY", "RunPod API Key"),
			],
			text: [],
			image: [
				param("workflowMode", "basic", "工作流模式"),
				param("workflowJson", "", "工作流 JSON"),
				param("checkpoint", "", "Checkpoint"),
				param("width", 832, "宽度", true),
				param("height", 1216, "高度", true),
				param("steps", 30, "步数", true),
				param("cfg", 5, "CFG", true),
				param("sampler", "euler_ancestral", "采样器"),
				param("scheduler", "karras", "调度器"),
				param("negativePrompt", "", "反向提示词", true),
			],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: {
			...emptyModels(),
			image: [{ id: "workflow", displayName: "工作流", enabled: true }],
		},
		requestOverride: { generateImage: "comfyuiGenerateImage" },
	},
	functions: { comfyuiGenerateImage: generateImage },
};
function text(value: unknown) {
	const result = typeof value === "string" ? value.trim() : "";
	if (!result) throw new Error("ComfyUI 提示词不能为空。");
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
