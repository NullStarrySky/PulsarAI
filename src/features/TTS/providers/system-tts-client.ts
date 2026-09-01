import { host } from "@/host";
import type { SystemSpeakRequest, SystemSpeechVoice } from "../tts";

export async function speakWithSystemTts(request: SystemSpeakRequest) {
	const text = request.text.trim();
	if (!text) throw new Error("系统 TTS 文本不能为空。");
	await host.speech.invoke("speak", {
		request: {
			text,
			language: request.language ?? null,
			voiceId: request.voiceId ?? null,
			rate: request.rate ?? null,
			pitch: request.pitch ?? null,
			volume: request.volume ?? null,
			queueMode: request.queueMode ?? null,
		},
	});
}

export async function stopSystemTts() {
	await host.speech.invoke("stop");
}

export async function getSystemTtsStatus() {
	return host.speech.invoke<{ initialized: boolean; voiceCount: number }>(
		"status",
	);
}

export async function listSystemTtsVoices(
	language?: string,
): Promise<SystemSpeechVoice[]> {
	const voices = await host.speech.invoke<
		Array<{ id: string; name: string; language: string }>
	>("voices", { language: language?.trim() || undefined });
	return voices.map((voice) => ({
		id: voice.id,
		name: voice.name,
		language: voice.language,
	}));
}

export async function previewSystemTtsVoice(voiceId: string, text?: string) {
	await host.speech.invoke("preview", {
		request: { voiceId, text: text?.trim() || null },
	});
}
