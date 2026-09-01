import { modelProxyFetch } from "@/features/ModelConnection/providers/model-proxy-fetch";
import {
	COMFYUI_RUNPOD_API_KEY_NAME,
	type ComfyUISettings,
} from "../image-generation-types";
import type { NovelAIGeneratedImage } from "./novelai-image-client";

type WorkflowNode = {
	class_type: string;
	inputs: Record<string, unknown>;
	_meta?: {
		pulsar?: WorkflowMetadata;
		cosmosVision?: WorkflowMetadata;
	};
};
type Workflow = Record<string, WorkflowNode>;
type PromptBinding = "positive" | "negative";
type WorkflowMetadata = {
	promptBindings?: Record<string, PromptBinding>;
	imageOutput?: boolean;
};
type HistoryImage = { filename: string; subfolder?: string; type?: string };
type HistoryEntry = {
	outputs?: Record<string, { images?: HistoryImage[] }>;
	status?: { status_str?: string; messages?: unknown[] };
};

const pollIntervalMs = 1000;

export interface ComfyUIGenerateOptions {
	prompt: string;
	settings: ComfyUISettings;
	count?: number;
	seed?: number;
	signal?: AbortSignal;
}

export async function testComfyUIConnection(settings: ComfyUISettings) {
	if (settings.serverType === "runpod") return testRunPodConnection(settings);
	const baseUrl = buildComfyUIBaseUrl(settings);
	const controller = new AbortController();
	const timeout = window.setTimeout(() => controller.abort(), 10000);
	try {
		const response = await proxyFetch(
			`${baseUrl}/object_info/CheckpointLoaderSimple`,
			undefined,
			controller.signal,
		);
		const payload = await readJson(response, "ComfyUI 连接测试");
		const checkpoints = extractCheckpointNames(payload);
		return { baseUrl, checkpoints };
	} catch (error) {
		if (controller.signal.aborted)
			throw new Error(
				`连接 ${baseUrl} 超过 10 秒，请检查主机、端口与 ComfyUI 监听地址。`,
			);
		throw error;
	} finally {
		window.clearTimeout(timeout);
	}
}

export async function generateComfyUIImages(options: ComfyUIGenerateOptions) {
	if (options.settings.serverType === "runpod")
		return generateRunPodImages(options);
	const baseUrl = buildComfyUIBaseUrl(options.settings);
	const seed = normalizeSeed(options.seed);
	const { workflow, outputNodeIds } = buildWorkflow(
		options.settings,
		options.prompt.trim(),
		seed,
		options.count ?? 1,
	);
	if (!options.prompt.trim()) throw new Error("ComfyUI 图片提示词不能为空。");

	const controller = new AbortController();
	const timeout = window.setTimeout(
		() => controller.abort(),
		options.settings.timeoutSeconds * 1000,
	);
	const forwardAbort = () => controller.abort();
	options.signal?.addEventListener("abort", forwardAbort, { once: true });
	try {
		const promptId = await queuePrompt(baseUrl, workflow, controller.signal);
		const images = await waitForImages(
			baseUrl,
			promptId,
			outputNodeIds,
			controller.signal,
		);
		return {
			images: await downloadImages(baseUrl, images, controller.signal),
			seed,
			promptId,
		};
	} catch (error) {
		if (controller.signal.aborted) {
			void modelProxyFetch(`${baseUrl}/interrupt`, { method: "POST" }).catch(
				() => undefined,
			);
			if (options.signal?.aborted) throw new Error("已取消 ComfyUI 生成。");
			throw new Error(
				`ComfyUI 生成超过 ${options.settings.timeoutSeconds} 秒。`,
			);
		}
		throw error;
	} finally {
		window.clearTimeout(timeout);
		options.signal?.removeEventListener("abort", forwardAbort);
	}
}

function buildRunPodBaseUrl(settings: ComfyUISettings) {
	const url = settings.runpodEndpointUrl.trim().replace(/\/+$/, "");
	if (!/^https?:\/\//i.test(url))
		throw new Error(
			"请填写完整的 RunPod Endpoint URL，例如 https://api.runpod.ai/v2/endpoint-id。",
		);
	return url;
}

async function testRunPodConnection(settings: ComfyUISettings) {
	const baseUrl = buildRunPodBaseUrl(settings);
	const response = await modelProxyFetch(`${baseUrl}/health`, {
		headers: runPodHeaders(),
	});
	const payload = await readJson(response, "RunPod /health");
	const readyWorkers = readReadyWorkers(payload);
	return { baseUrl, checkpoints: [] as string[], readyWorkers };
}

async function generateRunPodImages(options: ComfyUIGenerateOptions) {
	const baseUrl = buildRunPodBaseUrl(options.settings);
	const seed = normalizeSeed(options.seed);
	const { workflow } = buildWorkflow(
		options.settings,
		options.prompt.trim(),
		seed,
		options.count ?? 1,
	);
	const response = await modelProxyFetch(`${baseUrl}/run`, {
		method: "POST",
		headers: { ...runPodHeaders(), "Content-Type": "application/json" },
		body: JSON.stringify({ input: { workflow } }),
		signal: options.signal,
	});
	const queued = (await readJson(response, "RunPod /run")) as { id?: string };
	if (!queued.id) throw new Error("RunPod /run 未返回任务 ID。");
	const jobId = queued.id;
	const controller = new AbortController();
	const timeout = window.setTimeout(
		() => controller.abort(),
		options.settings.timeoutSeconds * 1000,
	);
	const forwardAbort = () => controller.abort();
	options.signal?.addEventListener("abort", forwardAbort, { once: true });
	try {
		while (!controller.signal.aborted) {
			const statusResponse = await modelProxyFetch(
				`${baseUrl}/status/${encodeURIComponent(jobId)}`,
				{
					headers: runPodHeaders(),
					signal: controller.signal,
				},
			);
			const status = (await readJson(
				statusResponse,
				"RunPod /status",
			)) as Record<string, unknown>;
			const images = readRunPodImages(status);
			if (images.length) return { images, seed, promptId: jobId };
			const state =
				typeof status.status === "string" ? status.status.toUpperCase() : "";
			if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(state))
				throw new Error(`RunPod 任务失败：${state}`);
			await wait(500, controller.signal);
		}
		throw new Error("RunPod 生成已取消。");
	} catch (error) {
		if (controller.signal.aborted)
			void modelProxyFetch(`${baseUrl}/cancel/${encodeURIComponent(jobId)}`, {
				method: "POST",
				headers: runPodHeaders(),
			});
		throw error;
	} finally {
		window.clearTimeout(timeout);
		options.signal?.removeEventListener("abort", forwardAbort);
	}
}

function runPodHeaders() {
	return { Authorization: `Bearer <<${COMFYUI_RUNPOD_API_KEY_NAME}>>` };
}

function readReadyWorkers(payload: unknown) {
	if (!isRecord(payload) || !isRecord(payload.workers)) return 0;
	return typeof payload.workers.ready === "number" ? payload.workers.ready : 0;
}

function readRunPodImages(
	payload: Record<string, unknown>,
): NovelAIGeneratedImage[] {
	if (!isRecord(payload.output) || !Array.isArray(payload.output.images))
		return [];
	return payload.output.images.flatMap((item) => {
		if (!isRecord(item) || typeof item.data !== "string") return [];
		const normalized = item.data.includes(",")
			? item.data.slice(item.data.indexOf(",") + 1)
			: item.data;
		const binary = atob(normalized);
		const bytes = Uint8Array.from(binary, (character) =>
			character.charCodeAt(0),
		);
		const filename =
			typeof item.filename === "string" ? item.filename : "image.png";
		return [
			{
				base64: normalized,
				mediaType: mediaTypeForName(filename),
				uint8Array: bytes,
			},
		];
	});
}

export function buildComfyUIBaseUrl(
	settings: Pick<ComfyUISettings, "protocol" | "host" | "port">,
) {
	const host = settings.host.trim();
	if (!host) throw new Error("请填写 ComfyUI 主机地址。");
	if (
		!Number.isInteger(settings.port) ||
		settings.port < 1 ||
		settings.port > 65535
	) {
		throw new Error("ComfyUI 端口必须是 1 到 65535 的整数。");
	}
	const normalizedHost = host.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
	return `${settings.protocol}://${normalizedHost}:${settings.port}`;
}

function buildWorkflow(
	settings: ComfyUISettings,
	prompt: string,
	seed: number,
	count: number,
) {
	if (settings.workflowMode === "basic") {
		if (!settings.checkpoint.trim())
			throw new Error("请先连接 ComfyUI 并选择 checkpoint。");
		return {
			workflow: createBasicWorkflow(settings, prompt, seed, count),
			outputNodeIds: ["9"],
		};
	}
	const workflow = parseCustomWorkflow(settings.workflowJson);
	applyCustomBindings(workflow, {
		prompt,
		negativePrompt: settings.negativePrompt,
		seed,
		width: settings.width,
		height: settings.height,
	});
	const outputNodeIds = findOutputNodeIds(workflow);
	if (!outputNodeIds.length)
		throw new Error(
			"自定义工作流没有 SaveImage、PreviewImage 或 imageOutput 标记节点。",
		);
	stripPulsarMetadata(workflow);
	return { workflow, outputNodeIds };
}

function createBasicWorkflow(
	settings: ComfyUISettings,
	prompt: string,
	seed: number,
	count: number,
): Workflow {
	return {
		"3": {
			class_type: "KSampler",
			inputs: {
				seed,
				steps: settings.steps,
				cfg: settings.cfg,
				sampler_name: settings.sampler,
				scheduler: settings.scheduler,
				denoise: 1,
				model: ["4", 0],
				positive: ["6", 0],
				negative: ["7", 0],
				latent_image: ["5", 0],
			},
		},
		"4": {
			class_type: "CheckpointLoaderSimple",
			inputs: { ckpt_name: settings.checkpoint },
		},
		"5": {
			class_type: "EmptyLatentImage",
			inputs: {
				width: settings.width,
				height: settings.height,
				batch_size: Math.min(4, Math.max(1, Math.trunc(count))),
			},
		},
		"6": {
			class_type: "CLIPTextEncode",
			inputs: { text: prompt, clip: ["4", 1] },
		},
		"7": {
			class_type: "CLIPTextEncode",
			inputs: { text: settings.negativePrompt, clip: ["4", 1] },
		},
		"8": {
			class_type: "VAEDecode",
			inputs: { samples: ["3", 0], vae: ["4", 2] },
		},
		"9": {
			class_type: "SaveImage",
			inputs: { filename_prefix: "PulsarAI", images: ["8", 0] },
		},
	};
}

function parseCustomWorkflow(source: string): Workflow {
	if (!source.trim())
		throw new Error("请粘贴 ComfyUI API-format 工作流 JSON。");
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch (error) {
		throw new Error(`ComfyUI 工作流 JSON 无效：${(error as Error).message}`);
	}
	if (!isRecord(parsed) || !Object.keys(parsed).length)
		throw new Error("ComfyUI 工作流必须是非空对象。");
	for (const [nodeId, node] of Object.entries(parsed)) {
		if (
			!isRecord(node) ||
			typeof node.class_type !== "string" ||
			!isRecord(node.inputs)
		) {
			throw new Error(`ComfyUI 工作流节点 ${nodeId} 结构无效。`);
		}
	}
	return structuredClone(parsed) as Workflow;
}

function applyCustomBindings(
	workflow: Workflow,
	values: Record<string, string | number>,
) {
	for (const node of Object.values(workflow)) {
		const metadata = node._meta?.pulsar ?? node._meta?.cosmosVision;
		for (const [inputName, binding] of Object.entries(
			metadata?.promptBindings ?? {},
		)) {
			node.inputs[inputName] =
				binding === "positive" ? values.prompt : values.negativePrompt;
		}
		for (const [inputName, value] of Object.entries(node.inputs)) {
			if (typeof value !== "string") continue;
			const exact = value.match(
				/^\{\{(prompt|negativePrompt|seed|width|height)\}\}$/,
			);
			if (exact) {
				node.inputs[inputName] = values[exact[1]!]!;
				continue;
			}
			node.inputs[inputName] = value
				.split("{{prompt}}")
				.join(String(values.prompt))
				.split("{{negativePrompt}}")
				.join(String(values.negativePrompt));
		}
	}
}

function findOutputNodeIds(workflow: Workflow) {
	const marked = Object.entries(workflow)
		.filter(
			([, node]) =>
				node._meta?.pulsar?.imageOutput ||
				node._meta?.cosmosVision?.imageOutput,
		)
		.map(([nodeId]) => nodeId);
	if (marked.length) return marked;
	return Object.entries(workflow)
		.filter(
			([, node]) =>
				node.class_type === "SaveImage" || node.class_type === "PreviewImage",
		)
		.map(([nodeId]) => nodeId);
}

function stripPulsarMetadata(workflow: Workflow) {
	for (const node of Object.values(workflow)) {
		if (!node._meta) continue;
		delete node._meta.pulsar;
		delete node._meta.cosmosVision;
		if (!Object.keys(node._meta).length) delete node._meta;
	}
}

async function queuePrompt(
	baseUrl: string,
	workflow: Workflow,
	signal: AbortSignal,
) {
	const response = await proxyFetch(
		`${baseUrl}/prompt`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				client_id: `pulsarai-${crypto.randomUUID()}`,
				prompt: workflow,
			}),
		},
		signal,
	);
	const payload = (await readJson(response, "ComfyUI /prompt")) as {
		prompt_id?: string;
	};
	if (!payload.prompt_id) throw new Error("ComfyUI /prompt 未返回 prompt_id。");
	return payload.prompt_id;
}

async function waitForImages(
	baseUrl: string,
	promptId: string,
	outputNodeIds: string[],
	signal: AbortSignal,
) {
	while (!signal.aborted) {
		const response = await proxyFetch(
			`${baseUrl}/history/${encodeURIComponent(promptId)}`,
			undefined,
			signal,
		);
		const payload = await readJson(response, "ComfyUI /history");
		const entry = readHistoryEntry(payload, promptId);
		const error = readExecutionError(entry);
		if (error) throw new Error(error);
		const images = readHistoryImages(entry, outputNodeIds);
		if (images) return images;
		await wait(pollIntervalMs, signal);
	}
	throw new Error("ComfyUI 生成已取消。");
}

function readHistoryEntry(
	payload: unknown,
	promptId: string,
): HistoryEntry | null {
	if (!isRecord(payload)) return null;
	if (isRecord(payload.outputs)) return payload as HistoryEntry;
	return isRecord(payload[promptId])
		? (payload[promptId] as HistoryEntry)
		: null;
}

function readHistoryImages(
	entry: HistoryEntry | null,
	outputNodeIds: string[],
): HistoryImage[] | null {
	if (!entry?.outputs) return null;
	const images = outputNodeIds
		.flatMap((nodeId) => entry.outputs?.[nodeId]?.images ?? [])
		.filter((image) => image.filename);
	if (images.length) return images;
	if (outputNodeIds.some((nodeId) => nodeId in entry.outputs!)) {
		throw new Error("ComfyUI 输出节点已完成，但没有返回图片。");
	}
	return null;
}

function readExecutionError(entry: HistoryEntry | null) {
	const status = entry?.status?.status_str?.toLowerCase() ?? "";
	if (!status.includes("error") && !status.includes("fail")) return null;
	return `ComfyUI 工作流执行失败：${entry?.status?.status_str ?? "未知错误"}`;
}

async function downloadImages(
	baseUrl: string,
	images: HistoryImage[],
	signal: AbortSignal,
): Promise<NovelAIGeneratedImage[]> {
	const results: NovelAIGeneratedImage[] = [];
	for (const image of images) {
		const query = new URLSearchParams({
			filename: image.filename,
			subfolder: image.subfolder ?? "",
			type: image.type ?? "output",
		});
		const response = await proxyFetch(
			`${baseUrl}/view?${query}`,
			undefined,
			signal,
		);
		if (!response.ok)
			throw new Error(`ComfyUI /view 请求失败 (${response.status})。`);
		const bytes = new Uint8Array(await response.arrayBuffer());
		results.push(
			binaryImage(
				bytes,
				response.headers.get("content-type") ||
					mediaTypeForName(image.filename),
			),
		);
	}
	return results;
}

async function readJson(response: Response, label: string): Promise<unknown> {
	if (!response.ok) {
		const detail = (await response.text().catch(() => "")).trim().slice(0, 240);
		throw new Error(
			`${label} 请求失败 (${response.status})${detail ? `：${detail}` : ""}`,
		);
	}
	try {
		return await response.json();
	} catch (error) {
		throw new Error(`${label} 没有返回有效 JSON：${(error as Error).message}`);
	}
}

function extractCheckpointNames(payload: unknown) {
	if (!isRecord(payload) || !isRecord(payload.CheckpointLoaderSimple))
		return [];
	const node = payload.CheckpointLoaderSimple;
	if (!isRecord(node.input) || !isRecord(node.input.required)) return [];
	const value = node.input.required.ckpt_name;
	if (!Array.isArray(value) || !Array.isArray(value[0])) return [];
	return value[0].filter(
		(item): item is string => typeof item === "string" && Boolean(item.trim()),
	);
}

function binaryImage(
	bytes: Uint8Array,
	mediaType: string,
): NovelAIGeneratedImage {
	let binary = "";
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return { base64: btoa(binary), mediaType, uint8Array: bytes };
}

function mediaTypeForName(name: string) {
	if (/\.webp$/i.test(name)) return "image/webp";
	if (/\.jpe?g$/i.test(name)) return "image/jpeg";
	return "image/png";
}

function normalizeSeed(seed?: number) {
	if (seed == null || !Number.isFinite(seed))
		return Math.floor(Math.random() * 4294967296);
	return Math.min(4294967295, Math.max(0, Math.trunc(seed)));
}

function wait(ms: number, signal: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		if (signal.aborted) return reject(new Error("ComfyUI 生成已取消。"));
		const abort = () => {
			window.clearTimeout(timeout);
			reject(new Error("ComfyUI 生成已取消。"));
		};
		const timeout = window.setTimeout(() => {
			signal.removeEventListener("abort", abort);
			resolve();
		}, ms);
		signal.addEventListener("abort", abort, { once: true });
	});
}

function proxyFetch(
	input: RequestInfo | URL,
	init?: RequestInit,
	signal?: AbortSignal,
) {
	if (!signal) return modelProxyFetch(input, init);
	if (signal.aborted) return Promise.reject(new Error("ComfyUI 请求已取消。"));
	return new Promise<Response>((resolve, reject) => {
		const abort = () => reject(new Error("ComfyUI 请求已取消。"));
		signal.addEventListener("abort", abort, { once: true });
		modelProxyFetch(input, init).then(
			(response) => {
				signal.removeEventListener("abort", abort);
				resolve(response);
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
