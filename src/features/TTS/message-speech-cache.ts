import { useSyncStore } from "@/features/Database/dbsync-store";
import { getSpeechModel } from "@/features/defaultConfigs/default-config-service";
import {
	mediaLink,
	resolveMediaUrl,
	writeMedia,
} from "@/features/Media/media-link";
import { applyPulse } from "@/features/Plugin/dataflow/pulse";
import { useFileApi } from "@/features/Plugin/dataflow/use-file-api";
import { pluginMediaSource } from "@/features/Plugin/resources/types/media/plugin-media";
import { PIPER_TTS_PROVIDER_ID } from "./providers/piper-tts-client";
import { generateSpeech } from "./text-to-speech";

let playing: HTMLAudioElement | null = null;

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
	localPluginId: string,
	messageId: string,
	text: string,
	voice = "",
) {
	const trimmed = text.trim();
	if (!trimmed) throw new Error("没有可朗读的内容。");

	if (!localPluginId) throw new Error("当前会话没有本地 Plugin。");
	const sync = useSyncStore();
	await sync.init();
	const plugin = sync.plugins.get(localPluginId);
	if (!plugin) throw new Error("当前会话的本地 Plugin 不存在。");
	const files = useFileApi({
		filetree: plugin,
		applyPulse: (pulse) => {
			applyPulse(plugin, pulse);
			sync.markDirty({ type: "plugin", id: localPluginId });
		},
	});
	if (!files.exists("/temp")) files.mkdir("/temp");

	const model = String((await getSpeechModel()) ?? "default");
	const extension = model.startsWith(`${PIPER_TTS_PROVIDER_ID}/`)
		? "wav"
		: "mp3";
	const filename = `tts-${await cacheKey(messageId, trimmed, model, voice)}.${extension}`;
	const cachePath = `/temp/${filename}`;
	const source = files.exists(cachePath)
		? pluginMediaSource(files.read(cachePath))
		: "";
	if (source) {
		await startPlayback(await resolveMediaUrl(source));
		return { cached: true };
	}

	const result = await generateSpeech({
		text: trimmed,
		...(voice ? { voice } : {}),
	});
	const bytes = result.audio.uint8Array;
	const mediaType = result.audio.mediaType || "audio/mpeg";
	const generatedSource = mediaLink(
		(await writeMedia(bytes, mediaType, "temp")).id,
	);
	files.write(cachePath, generatedSource);
	if (!generatedSource) throw new Error("生成的音频缓存无效。");
	await startPlayback(await resolveMediaUrl(generatedSource));
	return { cached: false };
}
