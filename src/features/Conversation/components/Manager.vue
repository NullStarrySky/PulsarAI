<script setup lang="ts">
import { push } from "notivue";
import {
	computed,
	nextTick,
	onUnmounted,
	ref,
	watch,
} from "vue";
import {
	Badge,
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
	FluidList,
	FluidListItem,
} from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSyncStore } from "@/features/Database/dbsync-store";
import { useCharacterList } from "@/features/Plugin/dataflow/use-plugin-data";
import { useUIStore } from "@/features/UI/store";
import { host } from "@/host";
import {
	ExternalLink,
	MessageCircle,
	MoreHorizontal,
	Pencil,
	Pin,
	Settings,
	Trash2,
} from "@/lib/remix-icons";
import { useConversationList } from "../dataflow/conversations";
import CharacterSwitcher from "./CharacterSwitcher.vue";

const props = withDefaults(
	defineProps<{
		localPluginId?: string;
		conversationId?: string;
		sidebarWidth?: number;
	}>(),
	{ sidebarWidth: 280 },
);

const emit = defineEmits<{
	select: [conversationId: string];
	"new-window": [conversationId: string];
	close: [conversationId: string];
	"character-change": [pluginId: string];
}>();

const ui = useUIStore();
const sync = useSyncStore();
const characterList = useCharacterList();

const activePluginId = ref(props.localPluginId || "");
const activeMenuId = ref<string | null>(null);

let contextMenuFrame = 0;
function openContextMenu(id: string) {
	cancelAnimationFrame(contextMenuFrame);
	activeMenuId.value = null;
	contextMenuFrame = requestAnimationFrame(() => {
		activeMenuId.value = id;
	});
}
onUnmounted(() => cancelAnimationFrame(contextMenuFrame));

// Inline rename state
const editingId = ref<string | null>(null);
const editingTitle = ref("");
const inlineInputRef = ref<HTMLInputElement | null>(null);

// Sync prop changes
watch(
	() => props.localPluginId,
	(id) => {
		if (id && id !== activePluginId.value) {
			activePluginId.value = id;
		}
	},
	{ immediate: true },
);

// Fallback to first character if activePluginId is empty
watch(
	() => [...characterList.characters.value],
	(list) => {
		if (!activePluginId.value && list[0]) {
			activePluginId.value = list[0].id;
			emit("character-change", list[0].id);
		}
	},
	{ immediate: true },
);

// Conversation list for currently selected character
const conversationList = computed(() =>
	useConversationList(activePluginId.value),
);

const visibleConversations = computed(() => {
	if (!activePluginId.value) return [];
	return [...conversationList.value.conversations.value].sort(
		(a, b) =>
			Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
			b.updatedAt.localeCompare(a.updatedAt),
	);
});

let characterSelection = 0;
async function selectCharacter(characterId: string) {
	const selection = ++characterSelection;
	activePluginId.value = characterId;
	emit("character-change", characterId);
	if (!characterId) return;
	await sync.load({ type: "plugin", id: characterId });
	await sync.load({ type: "conversationList", id: characterId });
	if (selection !== characterSelection) return;
	const list = useConversationList(characterId);
	const target =
		[...list.conversations.value].sort(
			(a, b) =>
				Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
				b.updatedAt.localeCompare(a.updatedAt),
		)[0] ?? list.create();
	if (target) emit("select", target.id);
}

function selectConversation(id: string) {
	if (editingId.value === id || props.conversationId === id) return;
	emit("select", id);
}

let lastWheelAt = 0;
let pendingWheelId: string | null = null;
let pendingWheelTimeout: ReturnType<typeof setTimeout> | undefined;

watch(
	() => props.conversationId,
	() => {
		pendingWheelId = null;
		clearTimeout(pendingWheelTimeout);
	},
);
onUnmounted(() => clearTimeout(pendingWheelTimeout));

function handleConversationWheel(event: WheelEvent) {
	if (event.ctrlKey || !event.deltaY || editingId.value) return;
	const conversations = visibleConversations.value;
	if (!conversations.length) return;
	event.preventDefault();
	const now = performance.now();
	if (pendingWheelId || now - lastWheelAt < 120) return;
	const currentIndex = conversations.findIndex(
		(conversation) => conversation.id === props.conversationId,
	);
	const wrapsToTop =
		event.deltaY > 0 && currentIndex === conversations.length - 1;
	const wrapsToBottom = event.deltaY < 0 && currentIndex === 0;
	let nextIndex =
		currentIndex < 0 ? 0 : currentIndex + Math.sign(event.deltaY);
	if (wrapsToTop) nextIndex = 0;
	else if (wrapsToBottom) nextIndex = conversations.length - 1;
	else nextIndex = Math.max(0, Math.min(conversations.length - 1, nextIndex));
	const next = conversations[nextIndex];
	if (!next || next.id === props.conversationId) return;
	pendingWheelId = next.id;
	lastWheelAt = now;
	selectConversation(next.id);
	const rows = (event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(
		"[data-proximity-index]",
	);
	rows[nextIndex]?.scrollIntoView({
		block: "nearest",
		behavior: wrapsToTop || wrapsToBottom ? "smooth" : "auto",
	});
	pendingWheelTimeout = setTimeout(() => {
		pendingWheelId = null;
	}, 1500);
}

function startRename(id: string, currentTitle: string) {
	editingId.value = id;
	editingTitle.value = currentTitle;
	nextTick(() => {
		inlineInputRef.value?.focus();
		inlineInputRef.value?.select();
	});
}

function saveRename(id: string) {
	if (editingId.value !== id) return;
	const title = editingTitle.value.trim();
	if (title) {
		const conversation = [...conversationList.value.conversations.value].find(
			(c) => c.id === id,
		);
		if (conversation && conversation.title !== title) {
			conversation.title = title;
			conversation.updatedAt = new Date().toISOString();
			sync.markDirty({ type: "meta", id: conversation.id });
		}
	}
	editingId.value = null;
}

function cancelRename() {
	editingId.value = null;
}

function togglePinned(id: string) {
	const conversation = [...conversationList.value.conversations.value].find(
		(c) => c.id === id,
	);
	if (!conversation) return;
	conversation.pinned = !conversation.pinned;
	conversation.updatedAt = new Date().toISOString();
	sync.markDirty({ type: "meta", id: conversation.id });
}

async function removeConversation(conversationId: string) {
	if (
		conversationId !== props.conversationId &&
		!sync.containers.has(conversationId) &&
		(await host.desktop?.window.isConversationOpen(conversationId))
	) {
		push.info("请先关闭正在使用该会话的窗口。");
		return;
	}
	const conversation = [...conversationList.value.conversations.value].find(
		(value) => value.id === conversationId,
	);
	if (!conversation || !window.confirm(`删除会话“${conversation.title}”？`))
		return;
	conversationList.value.delete(conversationId);
	await host.desktop?.window.releaseConversation(conversationId);
	emit("close", conversationId);
	if (conversationId === props.conversationId) {
		const next = [...conversationList.value.conversations.value][0];
		if (next) emit("select", next.id);
		else {
			const created = conversationList.value.create();
			if (created) emit("select", created.id);
		}
	}
}

</script>

<template>
  <aside class="relative flex h-full w-full shrink-0 flex-col bg-transparent text-sidebar-foreground select-none">
    <!-- Top spacer for fixed header action buttons -->
    <div class="h-11 shrink-0" />

    <!-- Character switcher -->
    <CharacterSwitcher
      :model-value="activePluginId"
      variant="sidebar"
      :sidebar-width="props.sidebarWidth"
      :auto-select-first="false"
      @update:model-value="selectCharacter"
    />

    <!-- Middle: Conversation List with FluidList gliding highlight -->
    <ScrollArea class="min-h-0 flex-1">
      <div class="p-2">
        <FluidList
          :model-value="props.conversationId"
          active-class="bg-primary/10 text-primary font-medium"
          hover-class="bg-muted/70"
          class="space-y-0.5"
          @update:model-value="(val) => selectConversation(String(val))"
          @wheel="handleConversationWheel"
        >
          <FluidListItem
            v-for="(conversation, index) in visibleConversations"
            :key="conversation.id"
            :value="conversation.id"
            :index="index"
            class="group relative flex w-full cursor-pointer items-center gap-2 rounded-lg p-2 text-left"
            @contextmenu.prevent="openContextMenu(conversation.id)"
          >
            <span class="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
              <MessageCircle class="size-3.5" />
            </span>

            <!-- Inline rename input -->
            <div v-if="editingId === conversation.id" class="flex min-w-0 flex-1 items-center gap-1" @click.stop>
              <input
                ref="inlineInputRef"
                v-model="editingTitle"
                class="h-7 w-full rounded border border-primary bg-background px-1.5 text-xs text-foreground outline-none shadow-xs"
                @keydown.enter.prevent="saveRename(conversation.id)"
                @keydown.esc.prevent="cancelRename"
                @blur="saveRename(conversation.id)"
              />
            </div>

            <!-- Normal title & preview display -->
            <div v-else class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-xs font-medium">{{ conversation.title }}</span>
                <Badge v-if="conversation.lifetime === 'app'" variant="secondary" class="px-1 text-[9px]">临时</Badge>
              </div>
              <span class="block truncate text-[10px] text-muted-foreground">
                {{ conversation.lastMessagePreview || '暂无消息' }}
              </span>
            </div>

            <!-- Pinned icon indicator -->
            <span v-if="conversation.pinned && editingId !== conversation.id" class="shrink-0 text-primary" title="已置顶">
              <Pin class="size-3" />
            </span>

            <!-- Dropdown menu trigger & popup -->
            <DropdownMenu
              :open="activeMenuId === conversation.id"
              @update:open="(val) => { if (val) activeMenuId = conversation.id; else if (activeMenuId === conversation.id) activeMenuId = null; }"
            >
              <DropdownMenuTrigger as-child>
                <button
                  type="button"
                  class="opacity-0 group-hover:opacity-100 hover:bg-muted/80 rounded p-0.5 text-muted-foreground transition-opacity shrink-0"
                  :class="{ 'opacity-100': activeMenuId === conversation.id }"
                  title="操作"
                >
                  <MoreHorizontal class="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent class="w-40 text-xs shadow-xl">
                <DropdownMenuItem @select="togglePinned(conversation.id)">
                  <Pin class="mr-2 size-3.5" />
                  {{ conversation.pinned ? '取消置顶' : '置顶会话' }}
                </DropdownMenuItem>
                <DropdownMenuItem @select="startRename(conversation.id, conversation.title)">
                  <Pencil class="mr-2 size-3.5" />
                  重命名
                </DropdownMenuItem>
                <template v-if="host.desktop">
                  <DropdownMenuSeparator />
                  <DropdownMenuItem @select="emit('new-window', conversation.id)">
                    <ExternalLink class="mr-2 size-3.5" />
                    在新窗口打开
                  </DropdownMenuItem>
                </template>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive focus:text-destructive" @select="removeConversation(conversation.id)">
                  <Trash2 class="mr-2 size-3.5" />
                  删除会话
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </FluidListItem>
        </FluidList>

        <div v-if="!visibleConversations.length" class="py-12 text-center text-xs text-muted-foreground">
          暂无会话
        </div>
      </div>
    </ScrollArea>

    <!-- Bottom: Settings Button matching SettingsSidebar return button -->
    <div class="mt-auto shrink-0 p-2">
      <Button
        variant="ghost"
        size="sm"
        class="w-full justify-start gap-2 h-9 px-3 text-xs text-muted-foreground hover:text-foreground"
        title="设置"
        @click="ui.settingsOpen = true"
      >
        <Settings class="size-4" />
        <span>设置</span>
      </Button>
    </div>
  </aside>
</template>
