<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { InputMessage } from "@/components/fluid";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { useCharacterList } from "@/features/Plugin/dataflow/use-plugin-data";
import { useUIStore } from "@/features/UI/store";
import { useActivePathComposable } from "../dataflow/activePathComposable";
import { useConversationList } from "../dataflow/conversations";
import CharacterSwitcher from "./CharacterSwitcher.vue";

const props = withDefaults(
	defineProps<{
		conversationId?: string;
		defaultPluginId?: string;
	}>(),
	{
		conversationId: "",
		defaultPluginId: "",
	},
);

const emit = defineEmits<{ "height-change": [height: number] }>();
const composerElement = ref<HTMLElement | null>(null);
let composerObserver: ResizeObserver | undefined;
onMounted(() => {
	if (!composerElement.value) return;
	composerObserver = new ResizeObserver(([entry]) => {
		if (entry) emit("height-change", Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height));
	});
	composerObserver.observe(composerElement.value);
});
onUnmounted(() => composerObserver?.disconnect());

const ui = useUIStore();
const sync = useSyncStore();
const characterList = useCharacterList();

const localDraft = ref("");

const conversation = shallowRef<ReturnType<
	typeof useActivePathComposable
> | null>(null);

watch(
	() => props.conversationId,
	(id) => {
		conversation.value = id ? useActivePathComposable(id) : null;
	},
	{ immediate: true },
);

const isBlank = computed(() => {
	if (!props.conversationId || !conversation.value) return true;
	const path = conversation.value.activePath.value;
	return !path || path.length === 0;
});

const draft = computed({
	get: () =>
		conversation.value ? conversation.value.draft.value : localDraft.value,
	set: (val: string) => {
		if (conversation.value) {
			conversation.value.draft.value = val;
		} else {
			localDraft.value = val;
		}
	},
});

const selectedPluginId = ref(
	conversation.value?.conversation.value?.localPluginId ||
		props.defaultPluginId ||
		"",
);

watch(
	() => [
		conversation.value?.conversation.value?.localPluginId,
		props.defaultPluginId,
	],
	([convPluginId, defPluginId]) => {
		if (convPluginId) {
			selectedPluginId.value = convPluginId;
		} else if (defPluginId && !selectedPluginId.value) {
			selectedPluginId.value = defPluginId;
		}
	},
	{ immediate: true },
);

async function send() {
	const text = draft.value?.trim();
	if (!text) return;

	// 1. If we are currently in an existing conversation, always send inside it
	if (props.conversationId && conversation.value) {
		conversation.value.draft.value = text;
		localDraft.value = "";
		await conversation.value.send();
		return;
	}

	// 2. We are on blank / home page: create new conversation under selected character and send
	const targetPluginId =
		selectedPluginId.value ||
		props.defaultPluginId ||
		[...characterList.characters.value][0]?.id;
	if (!targetPluginId) return;

	await sync.load({ type: "plugin", id: targetPluginId });
	await sync.load({ type: "conversationList", id: targetPluginId });
	const list = useConversationList(targetPluginId);

	const newConv = list.create();
	if (!newConv) return;

	localDraft.value = "";
	await ui.switch({ type: "conversation", id: newConv.id });
	const active = useActivePathComposable(newConv.id);
	active.draft.value = text;
	await active.send();
}
</script>

<template>
  <div
    ref="composerElement"
    class="pointer-events-none absolute inset-x-0 z-10 mx-auto w-full max-w-[756px] px-4 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] mobile:px-2"
    :style="{
      bottom: isBlank ? '50%' : '1rem',
      transform: isBlank ? 'translateY(50%)' : 'translateY(0)',
    }"
  >
    <!-- Character Switcher Menu in Blank State (upper-right corner of the input box) -->
    <div v-if="isBlank" class="pointer-events-auto mb-2.5 flex justify-end">
      <CharacterSwitcher v-model="selectedPluginId" />
    </div>

    <InputMessage
      v-model="draft"
      class="pointer-events-auto shadow-sm"
      placeholder="输入消息…"
      send-label="发送"
      @send="send"
    />
  </div>
</template>
