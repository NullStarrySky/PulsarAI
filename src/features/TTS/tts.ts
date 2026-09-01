type SpeechBoundaryType = "WordBoundary" | "SentenceBoundary";

export interface TextToSpeechRequest {
	text: string;
	voice?: string;
	rate?: string;
	volume?: string;
	pitch?: string;
	boundary?: SpeechBoundaryType;
}

export interface SpeechBoundary {
	type: SpeechBoundaryType;
	offset: number;
	duration: number;
	text: string;
}

export interface TextToSpeechResult {
	audio: Blob;
	audioBytes: number;
	boundaries: SpeechBoundary[];
}

export interface SpeechVoice {
	name: string;
	shortName: string;
	gender: string;
	locale: string;
	suggestedCodec: string;
	friendlyName: string;
	status: string;
	contentCategories: string[];
	voicePersonalities: string[];
}

export interface SystemSpeechVoice {
	id: string;
	name: string;
	language: string;
}

export interface SystemSpeakRequest {
	text: string;
	language?: string;
	voiceId?: string;
	rate?: number;
	pitch?: number;
	volume?: number;
	queueMode?: "flush" | "add";
}

export const VOLCENGINE_TTS_PROVIDER_ID = "volcengine-tts";
export const VOLCENGINE_TTS_APP_ID_SECRET = "volcengine_TTS_APP_ID";
export const VOLCENGINE_TTS_ACCESS_KEY_SECRET = "volcengine_TTS_ACCESS_KEY";
export const VOLCENGINE_TTS_ENDPOINT =
	"https://openspeech.bytedance.com/api/v3/tts/unidirectional";

export interface VolcengineTtsSettings {
	enabled: boolean;
	resourceId: string;
	speakerId: string;
	sampleRate: number;
}

export function createDefaultVolcengineTtsSettings(): VolcengineTtsSettings {
	return {
		enabled: false,
		resourceId: "seed-tts-2.0",
		speakerId: "",
		sampleRate: 24000,
	};
}

export function createVolcengineTtsModelRef(resourceId: string) {
	return `${VOLCENGINE_TTS_PROVIDER_ID}/${resourceId.trim()}`;
}

export const ELEVENLABS_TTS_PROVIDER_ID = "elevenlabs";
export const ELEVENLABS_TTS_API_KEY_SECRET = "elevenlabs_API_KEY";
const ELEVENLABS_TTS_DEFAULT_URL = "https://api.elevenlabs.io";

export interface ElevenLabsTtsSettings {
	enabled: boolean;
	baseUrl: string;
	modelId: string;
	voiceId: string;
	outputFormat: string;
	stability: number;
	similarityBoost: number;
	style: number;
	speakerBoost: boolean;
	speed: number;
}

export function createDefaultElevenLabsTtsSettings(): ElevenLabsTtsSettings {
	return {
		enabled: false,
		baseUrl: ELEVENLABS_TTS_DEFAULT_URL,
		modelId: "eleven_flash_v2_5",
		voiceId: "",
		outputFormat: "mp3_44100_128",
		stability: 0.75,
		similarityBoost: 0.75,
		style: 0,
		speakerBoost: true,
		speed: 1,
	};
}

export function createElevenLabsTtsModelRef(modelId: string) {
	return `${ELEVENLABS_TTS_PROVIDER_ID}/${modelId.trim()}`;
}

export const AZURE_TTS_PROVIDER_ID = "azure-speech";
export const AZURE_TTS_API_KEY_SECRET = "azure_SPEECH_API_KEY";
export const AZURE_TTS_MODEL_REF = `${AZURE_TTS_PROVIDER_ID}/standard`;

export interface AzureTtsSettings {
	enabled: boolean;
	region: string;
	voiceId: string;
	style: string;
	outputFormat: string;
	speed: number;
}

export function createDefaultAzureTtsSettings(): AzureTtsSettings {
	return {
		enabled: false,
		region: "",
		voiceId: "",
		style: "",
		outputFormat: "audio-24khz-48kbitrate-mono-mp3",
		speed: 1,
	};
}
