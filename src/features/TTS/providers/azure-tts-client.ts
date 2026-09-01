import { modelProxyFetch } from "@/features/ModelConnection/providers/model-proxy-fetch";
import { AZURE_TTS_API_KEY_SECRET, type AzureTtsSettings } from "../tts";

export interface AzureSpeechVoice {
	name: string;
	shortName: string;
	locale: string;
	localName: string;
	gender: string;
	styles: string[];
	sampleRateHertz: string;
}

export async function listAzureSpeechVoices(
	settings: AzureTtsSettings,
	signal?: AbortSignal,
) {
	const response = await azureSpeechFetch(
		settings,
		"/cognitiveservices/voices/list",
		{
			method: "GET",
			signal,
		},
	);
	if (!response.ok) await throwResponseError(response, "Azure Speech 声音列表");
	const payload = (await response.json()) as Array<{
		Name?: string;
		ShortName?: string;
		Locale?: string;
		LocalName?: string;
		Gender?: string;
		StyleList?: string[];
		SampleRateHertz?: string;
	}>;
	return payload
		.flatMap((voice): AzureSpeechVoice[] =>
			voice.ShortName
				? [
						{
							name: voice.Name || voice.ShortName,
							shortName: voice.ShortName,
							locale: voice.Locale || "",
							localName: voice.LocalName || voice.ShortName,
							gender: voice.Gender || "",
							styles: voice.StyleList ?? [],
							sampleRateHertz: voice.SampleRateHertz || "",
						},
					]
				: [],
		)
		.sort(
			(left, right) =>
				left.locale.localeCompare(right.locale) ||
				left.localName.localeCompare(right.localName),
		);
}

export async function synthesizeWithAzureSpeech(options: {
	settings: AzureTtsSettings;
	text: string;
	voiceId: string;
	style?: string;
	speed?: number;
	signal?: AbortSignal;
}) {
	const text = options.text.trim();
	const voiceId = options.voiceId.trim();
	if (!text) throw new Error("Azure Speech 合成文本不能为空。");
	if (!voiceId) throw new Error("请选择 Azure Speech 声音。");
	const locale = voiceId.split("-").slice(0, 2).join("-") || "en-US";
	const body = buildSsml(
		text,
		locale,
		voiceId,
		options.style?.trim(),
		options.speed,
	);
	const response = await azureSpeechFetch(
		options.settings,
		"/cognitiveservices/v1",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/ssml+xml",
				"X-Microsoft-OutputFormat": options.settings.outputFormat,
				"User-Agent": "PulsarAI",
			},
			body,
			signal: options.signal,
		},
	);
	if (!response.ok) await throwResponseError(response, "Azure Speech 语音生成");
	return {
		audio: new Uint8Array(await response.arrayBuffer()),
		mediaType: mediaTypeForAzureFormat(options.settings.outputFormat),
		headers: Object.fromEntries(response.headers.entries()),
	};
}

function azureSpeechFetch(
	settings: AzureTtsSettings,
	path: string,
	init: RequestInit,
) {
	const region = settings.region.trim().toLowerCase();
	if (!/^[a-z0-9-]+$/.test(region))
		throw new Error("请填写有效的 Azure Speech Region。");
	const headers = new Headers(init.headers);
	headers.set("Ocp-Apim-Subscription-Key", `<<${AZURE_TTS_API_KEY_SECRET}>>`);
	return modelProxyFetch(`https://${region}.tts.speech.microsoft.com${path}`, {
		...init,
		headers,
	});
}

function buildSsml(
	text: string,
	locale: string,
	voiceId: string,
	style?: string,
	speed?: number,
) {
	const percentage = speed && speed !== 1 ? Math.round((speed - 1) * 100) : 0;
	const rate = percentage
		? `${percentage > 0 ? "+" : ""}${percentage}%`
		: "default";
	const spoken = `<prosody rate="${rate}">${escapeXml(text)}</prosody>`;
	const styled = style
		? `<mstts:express-as style="${escapeXmlAttribute(style)}">${spoken}</mstts:express-as>`
		: spoken;
	return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${escapeXmlAttribute(locale)}"><voice name="${escapeXmlAttribute(voiceId)}">${styled}</voice></speak>`;
}

function escapeXml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string) {
	return escapeXml(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function throwResponseError(
	response: Response,
	operation: string,
): Promise<never> {
	const detail = (await response.text().catch(() => "")).trim().slice(0, 300);
	throw new Error(
		`${operation}失败 (${response.status})${detail ? `：${detail}` : ""}`,
	);
}

function mediaTypeForAzureFormat(format: string) {
	if (format.startsWith("riff") || format.startsWith("raw"))
		return format.startsWith("riff") ? "audio/wav" : "audio/pcm";
	if (format.startsWith("webm")) return "audio/webm";
	if (format.startsWith("ogg")) return "audio/ogg";
	return "audio/mpeg";
}
