<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { MessageCircle, Plus, Users } from "lucide-vue-next";
import {
	Button,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	TabItem,
	Tabs,
	TabsList,
} from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	createChat,
	loadChatsForLocalPlugin,
} from "../chats/chat-service";
import type { Conversation } from "../chats/chat-types";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";

const props = defineProps<{ open: boolean; activeLocalPluginId?: string }>();
const emit = defineEmits<{
	"update:open": [open: boolean];
	"open-chat": [chatId: string];
}>();

const localPlugins = useLocalPluginStore();
const page = ref<"roles" | "chats">("roles");
const selectedLocalPluginId = ref("");
const chats = ref<Conversation[]>([]);

const selectedRole = computed(
	() => localPlugins.localPlugins.find((role) => role.id === selectedLocalPluginId.value) ?? null,
);

async function loadChats() {
	if (!selectedLocalPluginId.value) {
		chats.value = [];
		return;
	}
	chats.value = (await loadChatsForLocalPlugin(selectedLocalPluginId.value)).sort(
		(a, b) => b.updatedAt.localeCompare(a.updatedAt),
	);
}

watch(
	() => props.open,
	async (open) => {
		if (!open) return;
		await localPlugins.refresh();
		selectedLocalPluginId.value = props.activeLocalPluginId || localPlugins.localPlugins[0]?.id || "";
		await loadChats();
	},
);
watch(selectedLocalPluginId, () => void loadChats());

function open(chat: Conversation) {
	emit("open-chat", chat.id);
	emit("update:open", false);
}

async function openRole(localPluginId: string) {
	selectedLocalPluginId.value = localPluginId;
	const latest = (await loadChatsForLocalPlugin(localPluginId)).sort(
		(a, b) => b.updatedAt.localeCompare(a.updatedAt),
	)[0] ?? (await createChat({ localPluginId }));
	open(latest);
}

async function createRole() {
	const role = await localPlugins.create();
	await openRole(role.id);
}

async function createConversation() {
	if (!selectedLocalPluginId.value) return;
	open(await createChat({ localPluginId: selectedLocalPluginId.value }));
}
</script>

<template>
  <Dialog :open="props.open" @update:open="emit('update:open', $event)">
    <DialogContent size="lg" class="w-[min(560px,calc(100vw-2rem))] p-0 overflow-hidden">
      <DialogHeader class="border-b px-5 pt-5 pb-3">
        <DialogTitle>打开会话</DialogTitle>
      </DialogHeader>
      <Tabs v-model="page" size="compact" class="block px-5 pt-3">
        <TabsList>
          <TabItem value="roles" :icon="Users" label="角色" />
          <TabItem value="chats" :icon="MessageCircle" label="会话" />
        </TabsList>
      </Tabs>
      <section v-if="page === 'roles'" class="p-3">
        <div class="mb-2 flex items-center justify-between px-2">
          <p class="text-xs text-muted-foreground">选择角色会直接打开最近会话。</p>
          <Button size="sm" class="h-8 gap-1.5" @click="createRole"><Plus class="size-3.5" />新建角色</Button>
        </div>
        <ScrollArea class="h-[min(420px,55vh)]">
          <div class="space-y-1 p-1">
            <button v-for="role in localPlugins.localPlugins" :key="role.id" type="button" class="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-muted/75" @click="openRole(role.id)">
              <img v-if="role.avatarUrl || role.coverUrl" :src="role.avatarUrl || role.coverUrl" :alt="role.name" class="size-9 rounded-full object-cover" />
              <span v-else class="grid size-9 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">{{ role.name.slice(0, 1) }}</span>
              <span class="min-w-0"><span class="block truncate text-sm font-medium">{{ role.name }}</span><span class="block truncate text-xs text-muted-foreground">{{ role.description || '本地角色' }}</span></span>
            </button>
          </div>
        </ScrollArea>
      </section>
      <section v-else class="p-3">
        <div class="mb-2 flex items-center gap-2 px-2">
          <select v-model="selectedLocalPluginId" class="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2 text-sm">
            <option v-for="role in localPlugins.localPlugins" :key="role.id" :value="role.id">{{ role.name }}</option>
          </select>
          <Button size="sm" class="h-8 gap-1.5" :disabled="!selectedRole" @click="createConversation"><Plus class="size-3.5" />新建会话</Button>
        </div>
        <ScrollArea class="h-[min(420px,55vh)]">
          <div class="space-y-1 p-1">
            <button v-for="chat in chats" :key="chat.id" type="button" class="flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-muted/75" @click="open(chat)">
              <span class="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground"><MessageCircle class="size-4" /></span>
              <span class="min-w-0"><span class="block truncate text-sm font-medium">{{ chat.title }}</span><span class="block truncate text-xs text-muted-foreground">{{ chat.lastMessagePreview || '空白会话' }}</span></span>
            </button>
            <p v-if="!chats.length" class="py-12 text-center text-sm text-muted-foreground">此角色还没有会话</p>
          </div>
        </ScrollArea>
      </section>
    </DialogContent>
  </Dialog>
</template>
