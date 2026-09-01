import { modelProxyFetch } from "@/features/ModelConnection/providers/model-proxy-fetch";
import {
	STABILITY_API_KEY_NAME,
	type StabilityModelId,
	type StabilitySettings,
} from "../image-generation-types";
import type { NovelAIGeneratedImage } from "./novelai-image-client";

const paths: Record<StabilityModelId, string> = {
	"stable-image-ultra": "/v2beta/stable-image/generate/ultra",
	"stable-image-core": "/v2beta/stable-image/generate/core",
	"stable-diffusion-3": "/v2beta/stable-image/generate/sd3",
};

export async function generateStabilityImages(options: {
	prompt: string;
	settings: StabilitySettings;
	model: StabilityModelId;
	count?: number;
	seed?: number;
	signal?: AbortSignal;
}) {
	const images: NovelAIGeneratedImage[] = [];
	const count = Math.min(4, Math.max(1, Math.trunc(options.count ?? 1)));
	for (let index = 0; index < count; index += 1) {
		const form = new FormData();
		form.set("prompt", options.prompt.trim().slice(0, 10000));
		if (options.settings.negativePrompt.trim())
			form.set(
				"negative_prompt",
				options.settings.negativePrompt.trim().slice(0, 10000),
			);
		form.set("aspect_ratio", options.settings.aspectRatio);
		form.set("output_format", options.settings.outputFormat);
		if (options.settings.stylePreset)
			form.set("style_preset", options.settings.stylePreset);
		if (options.seed != null && Number.isFinite(options.seed))
			form.set("seed", String(Math.max(0, Math.trunc(options.seed)) + index));
		if (options.model === "stable-diffusion-3")
			form.set("model", "sd3.5-large");

		const baseUrl = options.settings.baseUrl.trim().replace(/\/+$/, "");
		const response = await modelProxyFetch(
			`${baseUrl}${paths[options.model]}`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer <<${STABILITY_API_KEY_NAME}>>`,
					Accept: "image/*",
				},
				body: form,
				signal: options.signal,
			},
		);
		if (!response.ok)
			throw new Error(
				`Stability 请求失败 (${response.status})：${(await response.text()).slice(0, 300)}`,
			);
		const bytes = new Uint8Array(await response.arrayBuffer());
		const mediaType =
			response.headers.get("content-type") ||
			`image/${options.settings.outputFormat}`;
		images.push(binaryImage(bytes, mediaType));
	}
	return { images };
}

function binaryImage(
	bytes: Uint8Array,
	mediaType: string,
): NovelAIGeneratedImage {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	return { base64: btoa(binary), mediaType, uint8Array: bytes };
}
