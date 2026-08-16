import { getImageModel } from "@/features/defaultConfigs/default-config-service";
import {
  generateImage as generateImageWithModel,
  type GenerateImageResult,
  type HydratableModel,
} from "@/features/ModelConnection/services/model-ai";
import {
  AUTOMATIC1111_MODEL_REF,
  isAutomatic1111ModelReference,
  isComfyUIModelReference,
  isNovelAIModelReference,
  isStabilityModelReference,
  NOVELAI_MODELS,
  STABILITY_MODELS,
  type NovelAIModelId,
  type StabilityModelId,
} from "./image-generation-types";
import { generateAutomatic1111Images } from "./providers/automatic1111-image-client";
import { generateComfyUIImages } from "./providers/comfyui-image-client";
import { generateNovelAIImages } from "./providers/novelai-image-client";
import { generateStabilityImages } from "./providers/stability-image-client";
import { hasAutomatic1111Auth, loadAutomatic1111Settings } from "./automatic1111-settings";
import { loadComfyUISettings } from "./comfyui-settings";
import { loadNovelAISettings } from "./novelai-settings";
import { loadStabilitySettings } from "./stability-settings";

export type GenerateImageOptions = Omit<Parameters<typeof generateImageWithModel>[0], "model"> & {
  model?: HydratableModel;
};

export async function generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
  const model = options.model ?? await getImageModel();
  if (!model) {
    throw new Error("尚未配置图片生成模型。");
  }
  if (isAutomatic1111ModelReference(model)) {
    if (model !== AUTOMATIC1111_MODEL_REF || typeof options.prompt !== "string") throw new Error("A1111 当前只支持 automatic1111/txt2img 文本生图。");
    const settings = await loadAutomatic1111Settings();
    if (!settings.enabled) throw new Error("A1111 图片服务尚未启用。");
    const result = await generateAutomatic1111Images({
      prompt: options.prompt, settings, count: options.n, seed: options.seed,
      signal: options.abortSignal, useAuth: await hasAutomatic1111Auth(),
    });
    return specializedResult(result.images, { automatic1111: { images: [], seed: result.seed } });
  }
  if (isComfyUIModelReference(model)) {
    if (typeof options.prompt !== "string") {
      throw new Error("ComfyUI 专用服务当前只接受文本提示词。");
    }
    const settings = await loadComfyUISettings();
    if (!settings.enabled) throw new Error("ComfyUI 图片服务尚未启用。");
    const result = await generateComfyUIImages({
      prompt: options.prompt,
      settings,
      count: options.n,
      seed: options.seed,
      signal: options.abortSignal,
    });
    return {
      image: result.images[0]!,
      images: result.images,
      warnings: [],
      responses: [],
      providerMetadata: { comfyui: { images: [], promptId: result.promptId, seed: result.seed } },
      usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
    };
  }
  if (isNovelAIModelReference(model)) {
    if (typeof options.prompt !== "string") {
      throw new Error("NovelAI 专用服务当前只接受文本提示词。");
    }
    const modelId = model.slice(model.indexOf("/") + 1) as NovelAIModelId;
    if (!NOVELAI_MODELS.some((candidate) => candidate.id === modelId)) {
      throw new Error(`未知的 NovelAI 图片模型：${modelId}`);
    }
    const settings = await loadNovelAISettings();
    if (!settings.enabled) throw new Error("NovelAI 图片服务尚未启用。");
    const result = await generateNovelAIImages({
      prompt: options.prompt,
      settings,
      model: modelId,
      count: options.n,
      seed: options.seed,
      signal: options.abortSignal,
    });
    return {
      image: result.images[0]!,
      images: result.images,
      warnings: [],
      responses: [],
      providerMetadata: { novelai: { images: [], seed: result.seed } },
      usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
    };
  }
  if (isStabilityModelReference(model)) {
    if (typeof options.prompt !== "string") throw new Error("Stability 专用服务当前只接受文本提示词。");
    const modelId = model.slice(model.indexOf("/") + 1) as StabilityModelId;
    if (!STABILITY_MODELS.some((candidate) => candidate.id === modelId)) throw new Error(`未知的 Stability 图片模型：${modelId}`);
    const settings = await loadStabilitySettings();
    if (!settings.enabled) throw new Error("Stability 图片服务尚未启用。");
    const result = await generateStabilityImages({ prompt: options.prompt, settings, model: modelId, count: options.n, seed: options.seed, signal: options.abortSignal });
    return specializedResult(result.images, { stability: { images: [], model: modelId } });
  }
  return generateImageWithModel({ ...options, model });
}

function specializedResult(images: GenerateImageResult["images"], providerMetadata: GenerateImageResult["providerMetadata"]): GenerateImageResult {
  return {
    image: images[0]!, images, warnings: [], responses: [], providerMetadata,
    usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
  };
}
