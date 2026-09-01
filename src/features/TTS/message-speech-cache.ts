import { getSpeechModel } from "@/features/defaultConfigs/default-config-service";
import {
	createPluginMediaContent,
	pluginMediaSource,
} from "@/features/Plugin/editors/media/plugin-media";
import { useWorld } from "@/features/Plugin/tree/world-store";
import { PIPER_TTS_PROVIDER_ID } from "./providers/piper-tts-client";
import { generateSpeech } from "./text-to-speech";

let playing: HTMLAudioElement | null = null;

function base64(bytes: Uint8Array) {
	let result = "";
	const block = 0x8000;
	for (let index = 0; index < bytes.length; index += block) {
		result += String.fromCharCode(...bytes.subarray(index, index + block));
	}
	return btoa(result);
}

async function cacheKey(
	messageId: string,
	text: string,
	model: string,
	voice: string,
) {
	const input = new TextEncoder().encode(
		[messageId, text, model, voice].join("\u0000"),
	);
	const hash = await crypto.subtle.digest("SHA-256", input);
	return Array.from(new Uint8Array(hash), (value) =>
		value.toString(16).padStart(2, "0"),
	).join("");
}

async function startPlayback(source: string) {
	playing?.pause();
	playing = new Audio(source);
	playing.onended = () => {
		if (playing?.src === source) playing = null;
	};
	await playing.play();
}

/**
 * Caches generated audio under the package's conventional self/temp/
 * folder. The cache key contains the concrete message text, so an edited message
 * naturally cannot reuse a stale recording.
 */
export async function playMessageSpeech(
	packageId: string,
	messageId: string,
	text: string,
	voice = "",
) {
	const trimmed = text.trim();
	if (!trimmed) throw new Error("没有可朗读的内容。");

	if (!packageId) throw new Error("当前会话没有角色包。");
	const world = useWorld({ packageId, applyReplay: false });
	await world.mkdir("/self/temp");

	const model = String((await getSpeechModel()) ?? "default");
	const extension = model.startsWith(`${PIPER_TTS_PROVIDER_ID}/`)
		? "wav"
		: "mp3";
	const filename = `tts-${await cacheKey(messageId, trimmed, model, voice)}.${extension}`;
	const cachePath = `/self/temp/${filename}`;
	const cached = world.exists(cachePath) ? world.resolve(cachePath).node : null;
	const source =
		cached?.type === "file" ? pluginMediaSource(cached.content) : "";
	if (source) {
		await startPlayback(source);
		return { cached: true };
	}

	const result = await generateSpeech({
		text: trimmed,
		...(voice ? { voice } : {}),
	});
	const bytes = result.audio.uint8Array;
	const mediaType = result.audio.mediaType || "audio/mpeg";
	const content = createPluginMediaContent(
		`data:${mediaType};base64,${base64(bytes)}`,
	);
	await world.write(cachePath, content);
	const generatedSource = pluginMediaSource(content);
	if (!generatedSource) throw new Error("生成的音频缓存无效。");
	await startPlayback(generatedSource);
	return { cached: false };
}
