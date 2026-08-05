import { unzipSync } from "fflate";
import { modelProxyFetch } from "@/features/ModelConnection/infrastructure/model-proxy-fetch";
import {
  NOVELAI_API_KEY_NAME,
  type NovelAIModelId,
  type NovelAISettings,
} from "../domain/image-generation";

const maxSeed = 4294967295;
const qualityTags: Record<NovelAIModelId, string> = {
  "nai-diffusion-4-5-full": "location, very aesthetic, masterpiece, no text",
  "nai-diffusion-4-5-curated": "very aesthetic, masterpiece, no text, rating:general",
  "nai-diffusion-4-full": "no text, best quality, very aesthetic, absurdres",
  "nai-diffusion-4-curated-preview": "rating:general, amazing quality, very aesthetic, absurdres",
  "nai-diffusion-3": "best quality, amazing quality, very aesthetic, absurdres",
  "nai-diffusion-furry-3": "{best quality}, {amazing quality}",
};

export interface NovelAIGenerateOptions {
  prompt: string;
  settings: NovelAISettings;
  model?: NovelAIModelId;
  count?: number;
  seed?: number;
  signal?: AbortSignal;
}

export interface NovelAIGeneratedImage {
  mediaType: string;
  uint8Array: Uint8Array;
  base64: string;
}

export async function generateNovelAIImages(options: NovelAIGenerateOptions) {
  const count = Math.min(4, Math.max(1, Math.trunc(options.count ?? 1)));
  const model = options.model ?? options.settings.model;
  const seed = normalizeSeed(options.seed ?? options.settings.seed);
  const prompt = appendQualityTags(options.prompt.trim(), model, options.settings.addQualityTags);
  if (!prompt) throw new Error("NovelAI 图片提示词不能为空。");

  const response = await modelProxyFetch(buildEndpoint(options.settings.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer <<${NOVELAI_API_KEY_NAME}>>`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildPayload(options.settings, model, prompt, seed, count)),
    signal: options.signal,
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).trim().slice(0, 240);
    throw new Error(`NovelAI 请求失败 (${response.status})${detail ? `：${detail}` : ""}`);
  }

  const images = await extractImages(response);
  if (!images.length) throw new Error("NovelAI 响应中没有图片。");
  return { images, seed };
}

function buildEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) throw new Error("请先填写 NovelAI API 地址。");
  return `${normalized}/ai/generate-image`;
}

function buildPayload(
  settings: NovelAISettings,
  model: NovelAIModelId,
  prompt: string,
  seed: number,
  count: number,
) {
  const negativePrompt = settings.negativePrompt.trim();
  const parameters: Record<string, unknown> = {
    params_version: 3,
    width: settings.width,
    height: settings.height,
    scale: settings.guidance,
    sampler: settings.sampler,
    steps: settings.steps,
    n_samples: count,
    ucPreset: 0,
    qualityToggle: settings.addQualityTags,
    autoSmea: false,
    controlnet_strength: 1,
    add_original_image: true,
    cfg_rescale: 0,
    noise_schedule: "karras",
    legacy_v3_extend: false,
    legacy_uc: false,
    normalize_reference_strength_multiple: true,
    inpaintImg2ImgStrength: 1,
    seed,
    characterPrompts: [],
    negative_prompt: negativePrompt,
    prefer_brownian: true,
    dynamic_thresholding: false,
    legacy: false,
    skip_cfg_above_sigma: null,
    deliberate_euler_ancestral_bug: false,
  };
  if (model.startsWith("nai-diffusion-4")) {
    parameters.v4_prompt = {
      caption: { base_caption: prompt, char_captions: [] },
      use_coords: false,
      use_order: false,
    };
    parameters.v4_negative_prompt = {
      caption: { base_caption: negativePrompt, char_captions: [] },
      use_coords: false,
      use_order: false,
      legacy_uc: false,
    };
  }
  if (model.includes("diffusion-3") || model.includes("diffusion-furry-3")) {
    parameters.sm = false;
    parameters.sm_dyn = false;
  }
  return {
    action: "generate",
    input: prompt,
    model,
    parameters,
    use_new_shared_trial: true,
  };
}

async function extractImages(response: Response): Promise<NovelAIGeneratedImage[]> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    const payload = await response.json() as { images?: Array<{ image?: string }> };
    return (payload.images ?? [])
      .flatMap((item) => item.image ? [base64Image(item.image, "image/png")] : []);
  }

  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  return Object.entries(archive)
    .filter(([name]) => /\.(png|jpe?g|webp)$/i.test(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, bytes]) => binaryImage(bytes, mediaTypeForName(name)));
}

function base64Image(base64: string, mediaType: string): NovelAIGeneratedImage {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return { base64, mediaType, uint8Array: bytes };
}

function binaryImage(bytes: Uint8Array, mediaType: string): NovelAIGeneratedImage {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return { base64: btoa(binary), mediaType, uint8Array: bytes };
}

function mediaTypeForName(name: string) {
  if (/\.webp$/i.test(name)) return "image/webp";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  return "image/png";
}

function appendQualityTags(prompt: string, model: NovelAIModelId, enabled: boolean) {
  return [prompt, enabled ? qualityTags[model] : ""].filter(Boolean).join(", ");
}

function normalizeSeed(seed: number | null | undefined) {
  if (seed == null || !Number.isFinite(seed)) return Math.floor(Math.random() * (maxSeed + 1));
  return Math.min(maxSeed, Math.max(0, Math.trunc(seed)));
}
