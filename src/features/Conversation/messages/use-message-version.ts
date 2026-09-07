import { push } from "notivue";
import { computed, type MaybeRef, reactive, unref } from "vue";
import { useTranslateStore } from "@/features/Translate/translate-store";
import {
	copyMessageContent,
	exportMessageScreenshot,
	formatMessageTime,
	speakMessageContent,
} from "./message-version-actions";
import type { ChatMessage, FilePart } from "./message-types";

export interface MessageVersionOptions {
	localPluginId?: string;
	onUpdateContent?: (content: string) => Promise<void> | void;
	onUpdateTranslation?: (
		content: string,
		translation: NonNullable<ChatMessage["meta"]["translation"]>,
	) => Promise<void> | void;
}

export function useMessageVersion(
	messageRef: MaybeRef<ChatMessage | null | undefined>,
	options: MessageVersionOptions = {},
) {
	const translateStore = useTranslateStore();
	const editState = reactive({
		isEditing: false,
		draftContent: "",
	});

	const message = computed(() => unref(messageRef));

	const thinking = computed(() => {
		const steps = message.value?.meta?.steps ?? [];
		return steps.filter((step) => step.type === "thinking");
	});

	const attachments = computed<FilePart[]>(() => {
		const parts = message.value?.parts ?? [];
		return parts.filter((part): part is FilePart => part.type === "file");
	});

	const pulses = computed(() => {
		if (message.value?.meta.pulses?.length) return message.value.meta.pulses;
		const steps = message.value?.meta?.steps ?? [];
		return steps.flatMap((step) => {
			if (step.type !== "tool-result" || !step.output) return [];
			const out = step.output as Record<string, unknown>;
			if (Array.isArray(out.pulses)) {
				return out.pulses;
			}
			return [];
		});
	});

	const hasPluginChanges = computed(() => pulses.value.length > 0);

	const resourceSummary = computed(() => {
		if (!hasPluginChanges.value) return "";
		return `修改了 ${pulses.value.length} 项资源`;
	});

	const messageTime = computed(() => {
		return formatMessageTime(message.value?.createdAt);
	});

	const isTranslating = computed(() => false);

	async function translate() {
		const msg = message.value;
		if (!msg || !msg.content.trim()) return;
		try {
			const res = await translateStore.translateText(msg.content);
			if (res && options.onUpdateTranslation) {
				await options.onUpdateTranslation(msg.content, {
					translatedContent: res,
					targetLanguage: translateStore.state.targetLanguage,
					lastUpdated: new Date().toISOString(),
				});
				push.success("翻译完成");
			}
		} catch (e) {
			push.error("翻译失败");
		}
	}

	function startEdit() {
		const msg = message.value;
		if (!msg) return;
		editState.draftContent = msg.content;
		editState.isEditing = true;
	}

	async function saveEdit() {
		if (!editState.isEditing) return;
		const next = editState.draftContent;
		editState.isEditing = false;
		if (options.onUpdateContent) {
			await options.onUpdateContent(next);
		}
	}

	function cancelEdit() {
		editState.isEditing = false;
		editState.draftContent = "";
	}

	return {
		message,
		thinking,
		attachments,
		pulses,
		hasPluginChanges,
		resourceSummary,
		messageTime,
		isTranslating,
		editState,
		copy: () => copyMessageContent(message.value?.content ?? ""),
		speak: () => speakMessageContent(message.value?.content ?? ""),
		translate,
		startEdit,
		saveEdit,
		cancelEdit,
		exportScreenshot: (element: HTMLElement | null) =>
			exportMessageScreenshot(element),
	};
}
