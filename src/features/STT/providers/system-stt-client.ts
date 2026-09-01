import { host } from "@/host";
import type {
	SystemSpeechRecognitionError,
	SystemSpeechRecognitionOptions,
	SystemSpeechRecognitionResult,
} from "../stt";

export interface SystemSttAvailability {
	available: boolean;
	reason?: string;
}

export interface SystemSttPermission {
	microphone: "granted" | "denied" | "unknown";
	speechRecognition: "granted" | "denied" | "unknown";
}

export async function getSystemSttAvailability(): Promise<SystemSttAvailability> {
	const available = await host.mobile?.speechRecognition.isAvailable();
	return available
		? { available }
		: { available: false, reason: "系统语音识别仅在移动端可用。" };
}

export async function getSystemSttPermission(): Promise<SystemSttPermission> {
	return (
		host.mobile?.stt.invoke<SystemSttPermission>("permission") ?? {
			microphone: "denied",
			speechRecognition: "denied",
		}
	);
}

export async function requestSystemSttPermission(): Promise<SystemSttPermission> {
	return (
		host.mobile?.stt.invoke<SystemSttPermission>("requestPermission") ?? {
			microphone: "denied",
			speechRecognition: "denied",
		}
	);
}

export async function startSystemStt(
	options: SystemSpeechRecognitionOptions = {},
) {
	if (!host.mobile) throw new Error("系统语音识别仅在移动端可用。");
	await host.mobile.stt.invoke("start", {
		options: {
			language: options.language?.trim() || undefined,
			maxDuration: options.maxDuration,
			onDevice: options.onDevice,
		},
	});
}

export async function stopSystemStt() {
	await host.mobile?.stt.invoke("stop");
}

export function onSystemSttResult(
	handler: (result: SystemSpeechRecognitionResult) => void,
) {
	if (!host.mobile) return () => {};
	return host.mobile.stt.invoke<() => void>("onResult", { handler });
}

export function onSystemSttError(
	handler: (error: SystemSpeechRecognitionError) => void,
) {
	if (!host.mobile) return () => {};
	return host.mobile.stt.invoke<() => void>("onError", { handler });
}
