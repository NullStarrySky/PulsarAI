import { getSpeechModel } from "@/features/defaultConfigs/default-config-service";
import {
	generateSpeech as generateModelSpeech,
	type HydratableModel,
} from "@/features/ModelConnection/services/model-ai";
import { createAzureTtsSpeechModel } from "./providers/azure-tts-speech-model";
import {
	listEdgeTtsVoices,
} from "./providers/edge-tts-client";
import {
	EDGE_TTS_MODEL_REF,
	edgeTtsSpeechModel,
} from "./providers/edge-tts-speech-model";
import { createElevenLabsTtsSpeechModel } from "./providers/elevenlabs-tts-speech-model";
import {
	createPiperTtsSpeechModel,
	PIPER_TTS_PROVIDER_ID,
} from "./providers/piper-tts-speech-model";
import { createVolcengineTtsSpeechModel } from "./providers/volcengine-tts-speech-model";
import type {
	SpeechVoice,
} from "./tts";
import {
	AZURE_TTS_MODEL_REF,
	ELEVENLABS_TTS_PROVIDER_ID,
	VOLCENGINE_TTS_PROVIDER_ID,
} from "./tts";

export type GenerateSpeechOptions = Omit<
	Parameters<typeof generateModelSpeech>[0],
	"model"
> & {
	model?: HydratableModel;
};

export async function generateSpeech(options: GenerateSpeechOptions) {
	const configuredModel = options.model ?? (await getSpeechModel());
	const model = resolveSpeechModel(configuredModel);
	if (!model) {
		throw new Error("尚未配置语音生成模型。");
	}
	return generateModelSpeech({ ...options, model });
}

function resolveSpeechModel(
	model: HydratableModel | undefined,
): HydratableModel | undefined {
	if (model === EDGE_TTS_MODEL_REF) return edgeTtsSpeechModel;
	if (typeof model !== "string") return model;
	if (model.startsWith(`${VOLCENGINE_TTS_PROVIDER_ID}/`)) {
		return createVolcengineTtsSpeechModel(
			model.slice(`${VOLCENGINE_TTS_PROVIDER_ID}/`.length),
		);
	}
	if (model.startsWith(`${ELEVENLABS_TTS_PROVIDER_ID}/`)) {
		return createElevenLabsTtsSpeechModel(
			model.slice(`${ELEVENLABS_TTS_PROVIDER_ID}/`.length),
		);
	}
	if (model === AZURE_TTS_MODEL_REF) return createAzureTtsSpeechModel();
	if (model.startsWith(`${PIPER_TTS_PROVIDER_ID}/`)) {
		return createPiperTtsSpeechModel(
			model.slice(`${PIPER_TTS_PROVIDER_ID}/`.length),
		);
	}
	return model;
}

export async function listTextToSpeechVoices(): Promise<SpeechVoice[]> {
	return listEdgeTtsVoices();
}
