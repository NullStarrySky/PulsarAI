import { modelProxyFetch } from "@/features/ModelConnection/providers/model-proxy-fetch";
import { AUTOMATIC1111_BASIC_AUTH_NAME, type Automatic1111Settings } from "../image-generation-types";
import type { NovelAIGeneratedImage } from "./novelai-image-client";

interface Automatic1111Catalog {
  baseUrl: string;
  activeModel: string;
  models: string[];
  samplers: string[];
  schedulers: string[];
}

export function buildAutomatic1111BaseUrl(settings: Pick<Automatic1111Settings, "protocol" | "host" | "port">) {
  const host = settings.host.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!host) throw new Error("请填写 A1111 主机地址。");
  if (!Number.isInteger(settings.port) || settings.port < 1 || settings.port > 65535) throw new Error("A1111 端口无效。");
  return `${settings.protocol}://${host}:${settings.port}`;
}

export async function testAutomatic1111Connection(settings: Automatic1111Settings, useAuth: boolean): Promise<Automatic1111Catalog> {
  const baseUrl = buildAutomatic1111BaseUrl(settings);
  const headers = authHeaders(useAuth);
  const [options, models, samplers, schedulers] = await Promise.all([
    getJson(`${baseUrl}/sdapi/v1/options`, headers),
    getJson(`${baseUrl}/sdapi/v1/sd-models`, headers),
    getJson(`${baseUrl}/sdapi/v1/samplers`, headers),
    getJson(`${baseUrl}/sdapi/v1/schedulers`, headers).catch(() => []),
  ]);
  return {
    baseUrl,
    activeModel: readString(options, "sd_model_checkpoint"),
    models: readNames(models, "title"),
    samplers: readNames(samplers, "name"),
    schedulers: readNames(schedulers, "name"),
  };
}

export async function generateAutomatic1111Images(options: {
  prompt: string;
  settings: Automatic1111Settings;
  count?: number;
  seed?: number;
  signal?: AbortSignal;
  useAuth: boolean;
}) {
  const baseUrl = buildAutomatic1111BaseUrl(options.settings);
  const seed = normalizeSeed(options.seed);
  const overrideSettings = options.settings.model.trim() ? { sd_model_checkpoint: options.settings.model.trim() } : undefined;
  try {
    const response = await modelProxyFetch(`${baseUrl}/sdapi/v1/txt2img`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(options.useAuth) },
      body: JSON.stringify({
        prompt: options.prompt.trim(),
        negative_prompt: options.settings.negativePrompt,
        seed,
        batch_size: Math.min(4, Math.max(1, Math.trunc(options.count ?? 1))),
        n_iter: 1,
        steps: options.settings.steps,
        cfg_scale: options.settings.cfg,
        width: options.settings.width,
        height: options.settings.height,
        sampler_name: options.settings.sampler,
        scheduler: options.settings.scheduler,
        override_settings: overrideSettings,
        override_settings_restore_afterwards: true,
      }),
      signal: options.signal,
    });
    const payload = await readResponseJson(response, "A1111 txt2img") as { images?: unknown[] };
    const images = (payload.images ?? []).filter((item): item is string => typeof item === "string").map(base64Image);
    if (!images.length) throw new Error("A1111 响应中没有图片。");
    return { images, seed };
  } catch (error) {
    if (options.signal?.aborted) void modelProxyFetch(`${baseUrl}/sdapi/v1/interrupt`, { method: "POST", headers: authHeaders(options.useAuth) });
    throw error;
  }
}

function authHeaders(enabled: boolean): Record<string, string> {
  return enabled ? { Authorization: `Basic <<${AUTOMATIC1111_BASIC_AUTH_NAME}>>` } : {};
}

async function getJson(url: string, headers: Record<string, string>) {
  return readResponseJson(await modelProxyFetch(url, { headers }), "A1111");
}

async function readResponseJson(response: Response, label: string) {
  if (!response.ok) throw new Error(`${label} 请求失败 (${response.status})：${(await response.text()).slice(0, 240)}`);
  return response.json() as Promise<unknown>;
}

function readNames(value: unknown, key: string) {
  return Array.isArray(value) ? value.map((item) => readString(item, key)).filter(Boolean) : [];
}

function readString(value: unknown, key: string) {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>)[key] === "string"
    ? (value as Record<string, string>)[key]
    : "";
}

function base64Image(value: string): NovelAIGeneratedImage {
  const normalized = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return { base64: normalized, mediaType: "image/png", uint8Array: bytes };
}

function normalizeSeed(seed?: number) {
  return seed == null || !Number.isFinite(seed) ? -1 : Math.trunc(seed);
}
