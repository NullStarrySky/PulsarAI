import { push } from "notivue";
import { computed, type MaybeRef, unref } from "vue";
import { currentMessage } from "../activePathComposable/message-service";
import type { ChatContainer } from "../types";

export function useContainerActions(
	source: MaybeRef<ChatContainer | null | undefined>,
) {
	const content = computed(() => currentMessage(unref(source))?.content ?? "");
	async function copy() {
		try {
			await navigator.clipboard.writeText(content.value);
			push.success("已复制到剪贴板");
		} catch {
			push.error("复制失败");
		}
	}
	function speak() {
		if (content.value.trim() && "speechSynthesis" in window) {
			window.speechSynthesis.cancel();
			window.speechSynthesis.speak(new SpeechSynthesisUtterance(content.value));
		}
	}
	const messageTime = computed(() => {
		const time = currentMessage(unref(source))?.createdAt;
		return time && !Number.isNaN(new Date(time).getTime())
			? new Date(time).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
				})
			: "";
	});
	function exportScreenshot() {
		push.info("截图功能开发中");
	}
	function formatJson(value: unknown) {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}
	return { copy, speak, messageTime, exportScreenshot, formatJson };
}
