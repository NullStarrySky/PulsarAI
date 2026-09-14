<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { Button, TabItem, Tabs, TabsList } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCharacterList } from "@/features/Plugin/dataflow";
import { resolveMediaUrl } from "@/features/Plugin/media/media-link";
import {
	Grid2X2,
	List,
	Plus,
	Search,
	Upload,
	UserRound,
} from "@/lib/phosphor-icons";

const emit = defineEmits<{ open: [localPluginId: string] }>();
const characterList = useCharacterList();
const search = ref("");
const mode = ref<"card" | "list">("card");
const pending = ref<"create" | "import" | null>(null);
const actionError = ref("");
const media = reactive(new Map<string, string>());
const characters = computed(() => {
	const query = search.value.trim().toLocaleLowerCase();
	return [...characterList.characters.value]
		.filter(
			(character) =>
				!query ||
				character.name.toLocaleLowerCase().includes(query) ||
				character.description?.toLocaleLowerCase().includes(query),
		)
		.sort((left, right) => left.name.localeCompare(right.name));
});

watch(
	() =>
		[...characterList.characters.value].flatMap((item) => [
			item.avatarUrl,
			item.coverUrl,
		]),
	async (sources) => {
		for (const source of sources) {
			if (!source || media.has(source)) continue;
			media.set(source, await resolveMediaUrl(source));
		}
	},
	{ immediate: true },
);

async function createCharacter() {
	pending.value = "create";
	actionError.value = "";
	try {
		const character = await characterList.create();
		emit("open", character.id);
	} catch (error) {
		actionError.value = error instanceof Error ? error.message : String(error);
	} finally {
		pending.value = null;
	}
}

async function importCharacter() {
	pending.value = "import";
	actionError.value = "";
	try {
		const character = await characterList.import();
		if (character) emit("open", character.id);
	} catch (error) {
		actionError.value = error instanceof Error ? error.message : String(error);
	} finally {
		pending.value = null;
	}
}
</script>

<template>
  <main class="flex min-h-0 flex-1 flex-col bg-background">
    <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-2 px-6 py-5 mobile:px-3 mobile:py-3">
      <div class="relative min-w-44 flex-1"><Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input v-model="search" class="h-10 pl-9" placeholder="搜索角色…" /></div>
      <Tabs v-model="mode" size="compact" aria-label="角色视图">
        <TabsList>
          <TabItem value="card" title="卡片视图"><Grid2X2 /></TabItem>
          <TabItem value="list" title="列表视图"><List /></TabItem>
        </TabsList>
      </Tabs>
      <Button variant="outline" :disabled="pending !== null" @click="importCharacter"><Upload class="size-4" />{{ pending === 'import' ? '导入中…' : '导入角色' }}</Button>
      <Button :disabled="pending !== null" @click="createCharacter"><Plus class="size-4" />{{ pending === 'create' ? '创建中…' : '新建角色' }}</Button>
      </div>
    <p v-if="actionError" class="mx-auto mb-3 w-full max-w-6xl px-6 text-sm text-destructive mobile:px-3">{{ actionError }}</p>
    <ScrollArea class="min-h-0 flex-1"><div class="mx-auto w-full max-w-6xl px-6 pb-10 mobile:px-3">
      <div v-if="characters.length" :class="mode === 'card' ? 'grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-4 mobile:grid-cols-1' : 'flex flex-col gap-2'">
        <button v-for="character in characters" :key="character.id" type="button" class="group overflow-hidden rounded-xl bg-muted/25 text-left transition-colors hover:bg-muted/55" :class="mode === 'card' ? 'min-h-52' : 'flex min-h-20 items-center gap-3 p-3'" @click="emit('open', character.id)">
          <template v-if="mode === 'card'"><div class="relative h-28 overflow-hidden bg-muted"><img v-if="character.coverUrl" :src="media.get(character.coverUrl) ?? character.coverUrl" :alt="character.name" class="size-full object-cover transition-transform group-hover:scale-[1.02]" /><UserRound v-else class="absolute left-1/2 top-1/2 size-9 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" /></div><div class="flex items-start gap-3 p-4"><div class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-muted"><img v-if="character.avatarUrl" :src="media.get(character.avatarUrl) ?? character.avatarUrl" :alt="character.name" class="size-full object-cover" /><UserRound v-else class="size-5 text-muted-foreground" /></div><div class="min-w-0"><h2 class="truncate font-medium">{{ character.name }}</h2><p class="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{{ character.description || '暂无角色描述' }}</p></div></div></template>
          <template v-else><div class="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-muted"><img v-if="character.avatarUrl" :src="media.get(character.avatarUrl) ?? character.avatarUrl" :alt="character.name" class="size-full object-cover" /><UserRound v-else class="size-5 text-muted-foreground" /></div><div class="min-w-0 flex-1"><h2 class="truncate font-medium">{{ character.name }}</h2><p class="mt-1 truncate text-xs text-muted-foreground">{{ character.description || '暂无角色描述' }}</p></div></template>
        </button>
      </div>
      <div v-else class="grid min-h-64 place-items-center p-8 text-center"><div><UserRound class="mx-auto size-9 text-muted-foreground" /><p class="mt-3 text-sm font-medium">{{ search ? '没有匹配的角色' : '还没有角色' }}</p><p class="mt-1 text-xs text-muted-foreground">{{ search ? '尝试其他关键词。' : '新建角色或导入资源包后即可开始。' }}</p><Button v-if="!search" class="mt-4" size="sm" :disabled="pending !== null" @click="createCharacter"><Plus class="size-4" />新建角色</Button></div></div>
    </div></ScrollArea>
  </main>
</template>
