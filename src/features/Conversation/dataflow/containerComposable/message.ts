import { push } from "notivue";
import { computed, type MaybeRef, reactive, ref, unref } from "vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import { recalSize } from "@/features/Plugin/dataflow/recalculate";
import { currentMessage } from "../activePathComposable/message-service";
import { markContainerDirty } from "../containers";
import type {
	ConversationContainer,
	ConversationMessage,
	ThinkingStep,
} from "../types";

export function useContainerMessage(
	source: MaybeRef<ConversationContainer | null | undefined>,
) {
	const environment = useEnvironmentStore();
	const container = computed(() => unref(source));
	const current = computed(() => currentMessage(container.value));
	const thinking = computed(
		() =>
			current.value?.meta.steps.filter(
				(step): step is ThinkingStep => step.type === "thinking",
			) ?? [],
	);
	const recal = computed(() => current.value?.meta.recal);
	const resourceCount = computed(() => recalSize(recal.value));
	const hasPluginChanges = computed(() => resourceCount.value > 0);
	const resourceSummary = computed(() =>
		hasPluginChanges.value ? `修改了 ${resourceCount.value} 项资源` : "",
	);
	const edit = reactive({ active: false, content: "" });
	const translating = ref(false);
	function markDirty() {
		if (container.value)
			markContainerDirty(container.value.conversationId, container.value.id);
	}
	function setContent(content: string) {
		const message = current.value;
		if (!message) return;
		message.content = content;
		delete message.meta.translation;
		markDirty();
	}
	function setTranslation(
		translation: NonNullable<ConversationMessage["meta"]["translation"]>,
	) {
		const message = current.value;
		if (!message) return;
		message.meta.translation = translation;
		markDirty();
	}
	function startEdit() {
		if (current.value) {
			edit.content = current.value.content;
			edit.active = true;
		}
	}
	function saveEdit() {
		if (edit.active) setContent(edit.content);
		edit.active = false;
	}
	function cancelEdit() {
		edit.active = false;
		edit.content = "";
	}
	async function translate() {
		if (!current.value?.content.trim() || translating.value) return;
		translating.value = true;
		try {
			const translatedContent = await environment.translateText(
				current.value.content,
			);
			if (translatedContent) {
				setTranslation({
					translatedContent,
					targetLanguage: environment.translateSettings.targetLanguage,
					lastUpdated: new Date().toISOString(),
				});
				push.success("翻译完成");
			}
		} catch {
			push.error("翻译失败");
		} finally {
			translating.value = false;
		}
	}
	return {
		current,
		thinking,
		recal,
		hasPluginChanges,
		resourceSummary,
		edit,
		translating,
		setContent,
		setTranslation,
		startEdit,
		saveEdit,
		cancelEdit,
		translate,
	};
}
