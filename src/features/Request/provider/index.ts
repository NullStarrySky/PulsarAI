import { createSandboxFunction } from "@/features/Plugin/runtime/sandbox";
import type {
	BuiltInComponents,
	BuiltInFunctions,
	FunctionalString,
	Provider,
} from "../types";
import { automatic1111 } from "./automatic1111";
import { azureSpeech } from "./azure-speech";
import { comfyui } from "./comfyui";
import { edgeTts } from "./edge-tts";
import { elevenLabs } from "./elevenlabs";
import { novelai } from "./novelai";
import { piper } from "./piper";
import LocalModelDownload from "./shared/components/LocalModelDownload.vue";
import SecretInput from "./shared/components/SecretInput.vue";
import type { ProviderRegistration } from "./shared/registration";
import { stability } from "./stability";
import { volcengineTts } from "./volcengine-tts";
import { whisperCandle } from "./whisper-candle";

const registrations: ProviderRegistration[] = [
	automatic1111,
	comfyui,
	novelai,
	stability,
	edgeTts,
	piper,
	whisperCandle,
	volcengineTts,
	elevenLabs,
	azureSpeech,
];
export const localRequestProviders: Provider[] = registrations.map(
	({ provider }) => provider,
);
export const builtInFunctions: BuiltInFunctions = new Map(
	registrations.flatMap(({ functions = {} }) => Object.entries(functions)),
);
export const builtInComponents: BuiltInComponents = new Map([
	["SecretInput", SecretInput],
	["PiperModelDownload", LocalModelDownload],
	["WhisperModelDownload", LocalModelDownload],
	...registrations.flatMap(({ components = {} }) => Object.entries(components)),
]);
export async function invokeRequestFunction<T>(
	source: FunctionalString,
	context: Record<string, unknown>,
): Promise<T> {
	const builtIn = builtInFunctions.get(source);
	return (
		builtIn
			? await builtIn(context)
			: await createSandboxFunction(source)(context)
	) as T;
}
