import type { HydratableModel } from "@/features/ModelConnection/services/model-ai";

export interface ImageGenerationServiceOptions {
  model?: HydratableModel;
  prompt: string;
}

export const NOVELAI_PROVIDER_ID = "novelai";
export const NOVELAI_API_KEY_NAME = "novelai_IMAGE_API_KEY";
export const NOVELAI_DEFAULT_URL = "https://image.novelai.net";

export const NOVELAI_MODELS = [
  { id: "nai-diffusion-4-5-curated", name: "NAI Diffusion v4.5 Curated" },
  { id: "nai-diffusion-4-5-full", name: "NAI Diffusion v4.5 Full" },
  { id: "nai-diffusion-4-curated-preview", name: "NAI Diffusion v4 Curated" },
  { id: "nai-diffusion-4-full", name: "NAI Diffusion v4 Full" },
  { id: "nai-diffusion-3", name: "NAI Diffusion Anime v3" },
  { id: "nai-diffusion-furry-3", name: "NAI Diffusion Furry v3" },
] as const;

export const NOVELAI_SAMPLERS = [
  { id: "k_euler", name: "Euler" },
  { id: "k_euler_ancestral", name: "Euler Ancestral" },
  { id: "k_dpmpp_2s_ancestral", name: "DPM++ 2S Ancestral" },
  { id: "k_dpmpp_2m_sde", name: "DPM++ 2M SDE" },
  { id: "k_dpmpp_2m", name: "DPM++ 2M" },
  { id: "k_dpmpp_sde", name: "DPM++ SDE" },
  { id: "ddim", name: "DDIM" },
] as const;

export type NovelAIModelId = (typeof NOVELAI_MODELS)[number]["id"];
export type NovelAISamplerId = (typeof NOVELAI_SAMPLERS)[number]["id"];

export interface NovelAISettings {
  enabled: boolean;
  baseUrl: string;
  model: NovelAIModelId;
  width: number;
  height: number;
  steps: number;
  guidance: number;
  sampler: NovelAISamplerId;
  seed: number | null;
  negativePrompt: string;
  addQualityTags: boolean;
}

export function createDefaultNovelAISettings(): NovelAISettings {
  return {
    enabled: false,
    baseUrl: NOVELAI_DEFAULT_URL,
    model: "nai-diffusion-4-5-curated",
    width: 832,
    height: 1216,
    steps: 28,
    guidance: 5.5,
    sampler: "k_euler_ancestral",
    seed: null,
    negativePrompt: "",
    addQualityTags: true,
  };
}

export function isNovelAIModelReference(model: unknown): model is string {
  return typeof model === "string" && model.startsWith(`${NOVELAI_PROVIDER_ID}/`);
}

export const COMFYUI_PROVIDER_ID = "comfyui";
export const COMFYUI_MODEL_REF = `${COMFYUI_PROVIDER_ID}/workflow`;

export type ComfyUIWorkflowMode = "basic" | "custom";

export interface ComfyUISettings {
  enabled: boolean;
  serverType: "standard" | "runpod";
  protocol: "http" | "https";
  host: string;
  port: number;
  runpodEndpointUrl: string;
  timeoutSeconds: number;
  workflowMode: ComfyUIWorkflowMode;
  workflowJson: string;
  checkpoint: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  negativePrompt: string;
}

export function createDefaultComfyUISettings(): ComfyUISettings {
  return {
    enabled: false,
    serverType: "standard",
    protocol: "http",
    host: "127.0.0.1",
    port: 8188,
    runpodEndpointUrl: "",
    timeoutSeconds: 120,
    workflowMode: "basic",
    workflowJson: "",
    checkpoint: "",
    width: 832,
    height: 1216,
    steps: 30,
    cfg: 5,
    sampler: "euler_ancestral",
    scheduler: "karras",
    negativePrompt: "",
  };
}

export function isComfyUIModelReference(model: unknown): model is string {
  return typeof model === "string" && model.startsWith(`${COMFYUI_PROVIDER_ID}/`);
}

export const COMFYUI_RUNPOD_API_KEY_NAME = "comfyui_RUNPOD_API_KEY";

export const AUTOMATIC1111_PROVIDER_ID = "automatic1111";
export const AUTOMATIC1111_MODEL_REF = `${AUTOMATIC1111_PROVIDER_ID}/txt2img`;
export const AUTOMATIC1111_BASIC_AUTH_NAME = "automatic1111_BASIC_AUTH";

export interface Automatic1111Settings {
  enabled: boolean;
  protocol: "http" | "https";
  host: string;
  port: number;
  model: string;
  sampler: string;
  scheduler: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  negativePrompt: string;
}

export function createDefaultAutomatic1111Settings(): Automatic1111Settings {
  return {
    enabled: false,
    protocol: "http",
    host: "127.0.0.1",
    port: 7860,
    model: "",
    sampler: "Euler a",
    scheduler: "Automatic",
    width: 832,
    height: 1216,
    steps: 28,
    cfg: 7,
    negativePrompt: "",
  };
}

export function isAutomatic1111ModelReference(model: unknown): model is string {
  return typeof model === "string" && model.startsWith(`${AUTOMATIC1111_PROVIDER_ID}/`);
}

export const STABILITY_PROVIDER_ID = "stability";
export const STABILITY_API_KEY_NAME = "stability_API_KEY";
export const STABILITY_DEFAULT_URL = "https://api.stability.ai";
export const STABILITY_MODELS = [
  { id: "stable-image-ultra", name: "Stable Image Ultra" },
  { id: "stable-image-core", name: "Stable Image Core" },
  { id: "stable-diffusion-3", name: "Stable Diffusion 3 / 3.5" },
] as const;
export type StabilityModelId = (typeof STABILITY_MODELS)[number]["id"];

export interface StabilitySettings {
  enabled: boolean;
  baseUrl: string;
  model: StabilityModelId;
  aspectRatio: string;
  outputFormat: "png" | "jpeg" | "webp";
  negativePrompt: string;
  stylePreset: string;
}

export function createDefaultStabilitySettings(): StabilitySettings {
  return {
    enabled: false,
    baseUrl: STABILITY_DEFAULT_URL,
    model: "stable-image-core",
    aspectRatio: "2:3",
    outputFormat: "png",
    negativePrompt: "",
    stylePreset: "",
  };
}

export function isStabilityModelReference(model: unknown): model is string {
  return typeof model === "string" && model.startsWith(`${STABILITY_PROVIDER_ID}/`);
}
