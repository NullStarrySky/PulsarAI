import { push } from "notivue";

export async function copyMessageContent(content: string) {
	try {
		await navigator.clipboard.writeText(content);
		push.success("已复制到剪贴板");
	} catch (e) {
		push.error("复制失败");
	}
}

export async function speakMessageContent(content: string) {
	if (!content.trim()) return;
	try {
		if ("speechSynthesis" in window) {
			window.speechSynthesis.cancel();
			const utterance = new SpeechSynthesisUtterance(content);
			window.speechSynthesis.speak(utterance);
		} else {
			push.warning("当前环境不支持语音朗读");
		}
	} catch (e) {
		push.error("朗读失败");
	}
}

export async function exportMessageScreenshot(_element: HTMLElement | null) {
	push.info("截图功能开发中");
}

export function formatMessageTime(isoString?: string): string {
	if (!isoString) return "";
	const date = new Date(isoString);
	if (isNaN(date.getTime())) return "";
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatJsonValue(val: unknown): string {
	try {
		return JSON.stringify(val, null, 2);
	} catch {
		return String(val);
	}
}
