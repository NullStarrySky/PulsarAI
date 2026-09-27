<script setup lang="ts">
import { push } from "notivue";
import { computed, reactive, ref, watch } from "vue";
import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/fluid";
import {
	type CharacterData,
	useCharacterList,
} from "@/features/Plugin/dataflow/use-plugin-data";
import { resolveMediaUrl } from "@/features/Plugin/media/media-link";
import {
	MoreHorizontal,
	ChevronDown,
	Pencil,
	Plus,
	Search,
	Trash2,
	UserRound,
} from "@/lib/remix-icons";

const props = defineProps<{
	modelValue: string;
	variant?: "compact" | "sidebar";
	sidebarWidth?: number;
	autoSelectFirst?: boolean;
}>();

const emit = defineEmits<{
	"update:modelValue": [id: string];
}>();

const characterList = useCharacterList();
const search = ref("");
const media = reactive(new Map<string, string>());
const dropdownOpen = ref(false);
let wheelDelta = 0;
const activeCharacterMenuId = ref<string | null>(null);
const menuTop = ref(0);
watch(dropdownOpen, (open) => {
	if (!open) activeCharacterMenuId.value = null;
});

function openCharacterMenu(id: string, event: MouseEvent) {
	const popup = (event.currentTarget as HTMLElement).closest<HTMLElement>(
		'[role="menu"]',
	);
	if (popup) {
		const bounds = popup.getBoundingClientRect();
		menuTop.value = Math.max(4, Math.min(event.clientY - bounds.top, bounds.height - 76));
	}
	activeCharacterMenuId.value = id;
}

// Fallback to first character if modelValue is empty
watch(
	() => [...characterList.characters.value],
	(list) => {
		if (props.autoSelectFirst !== false && !props.modelValue && list[0]) {
			emit("update:modelValue", list[0].id);
		}
	},
	{ immediate: true },
);

// Cache avatars
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

const activeCharacter = computed(() =>
	[...characterList.characters.value].find((c) => c.id === props.modelValue),
);
const menuCharacter = computed(() =>
	[...characterList.characters.value].find((c) => c.id === activeCharacterMenuId.value),
);

const filteredCharacters = computed(() => {
	const query = search.value.trim().toLocaleLowerCase();
	return [...characterList.characters.value]
		.filter(
			(c) =>
				!query ||
				c.name.toLocaleLowerCase().includes(query) ||
				c.description?.toLocaleLowerCase().includes(query),
		)
		.sort((a, b) => a.name.localeCompare(b.name));
});

const isSidebar = computed(() => props.variant === "sidebar");
const dropdownWidth = computed(() =>
	isSidebar.value ? Math.max(200, (props.sidebarWidth ?? 280) - 16) : 288,
);

function handleValueChange(id: string) {
	if (id) {
		emit("update:modelValue", id);
		dropdownOpen.value = false;
	}
}

function handleWheel(event: WheelEvent) {
	if (event.ctrlKey || !event.deltaY || !filteredCharacters.value.length) return;
	event.preventDefault();
	wheelDelta +=
		event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
	if (Math.abs(wheelDelta) < 40) return;
	const direction = Math.sign(wheelDelta);
	wheelDelta = 0;
	const currentIndex = filteredCharacters.value.findIndex(
		(character) => character.id === props.modelValue,
	);
	const wrapsToTop =
		direction > 0 && currentIndex === filteredCharacters.value.length - 1;
	const wrapsToBottom = direction < 0 && currentIndex === 0;
	let nextIndex = currentIndex < 0 ? 0 : currentIndex + direction;
	if (wrapsToTop) nextIndex = 0;
	else if (wrapsToBottom) nextIndex = filteredCharacters.value.length - 1;
	else
		nextIndex = Math.max(
			0,
			Math.min(filteredCharacters.value.length - 1, nextIndex),
		);
	const next = filteredCharacters.value[nextIndex];
	if (!next || next.id === props.modelValue) return;
	emit("update:modelValue", next.id);
	(event.currentTarget as HTMLElement)
		.querySelectorAll<HTMLElement>("[data-proximity-index]")[nextIndex]
		?.scrollIntoView({
			block: "nearest",
			behavior: wrapsToTop || wrapsToBottom ? "smooth" : "auto",
		});
}

async function createCharacter() {
	try {
		const character = await characterList.create();
		if (character) {
			emit("update:modelValue", character.id);
			dropdownOpen.value = false;
		}
	} catch (error) {
		push.error(error instanceof Error ? error.message : "无法新建角色。");
	}
}

async function handleRename(character: CharacterData) {
	activeCharacterMenuId.value = null;
	const newName = window.prompt("重命名角色", character.name);
	if (newName?.trim() && newName.trim() !== character.name) {
		try {
			await characterList.rename(character.id, newName.trim());
			push.success("角色已重命名");
		} catch (error) {
			push.error(error instanceof Error ? error.message : "重命名失败");
		}
	}
}

async function handleDelete(character: CharacterData) {
	activeCharacterMenuId.value = null;
	if (!window.confirm(`确定删除角色“${character.name}”及其所有关联会话？`))
		return;
	try {
		await characterList.remove(character.id);
		push.success("角色及关联会话已删除");
		if (props.modelValue === character.id) {
			const remaining = [...characterList.characters.value].find(
				(c) => c.id !== character.id,
			);
			if (remaining) {
				emit("update:modelValue", remaining.id);
			} else {
				emit("update:modelValue", "");
			}
		}
	} catch (error) {
		push.error(error instanceof Error ? error.message : "删除失败");
	}
}
</script>

<template>
  <div class="relative select-none" :class="isSidebar && 'flex h-12 shrink-0 items-center px-2'">
    <DropdownMenu v-model:open="dropdownOpen">
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="flex min-w-0 items-center rounded-lg text-left text-xs text-foreground hover:bg-muted/80 focus-visible:outline-none"
          :class="isSidebar ? 'flex-1 gap-2 px-2 py-1.5 font-semibold' : 'h-8 max-w-[220px] gap-1.5 border border-border/80 bg-background/95 px-2.5 py-1 font-medium shadow-xs'"
          title="切换所属角色"
        >
          <div class="grid shrink-0 place-items-center overflow-hidden rounded-full border border-border/50 bg-muted" :class="isSidebar ? 'size-7' : 'size-4'">
            <img
              v-if="activeCharacter?.avatarUrl"
              :src="media.get(activeCharacter.avatarUrl) ?? activeCharacter.avatarUrl"
              :alt="activeCharacter?.name"
              class="size-full object-cover"
            />
            <UserRound v-else class="text-muted-foreground" :class="isSidebar ? 'size-3.5' : 'size-2.5'" />
          </div>
          <span class="truncate text-xs" :class="isSidebar ? 'min-w-0 flex-1' : 'max-w-[140px]'">
            {{ activeCharacter?.name ?? '选择角色' }}
          </span>
          <ChevronDown v-if="isSidebar" class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200" :class="dropdownOpen && 'rotate-180'" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        class="max-h-[380px] p-1.5 shadow-xl"
        align="start"
        :side-offset="6"
        :style="{ width: `${dropdownWidth}px`, maxWidth: `${dropdownWidth}px` }"
        :checked-index="filteredCharacters.findIndex((character) => character.id === props.modelValue)"
      >
        <!-- Search and New character on the same row -->
        <div class="flex items-center gap-1.5 p-1 shrink-0" @keydown.stop @pointerdown.stop>
          <div class="relative flex-1">
            <Search class="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              v-model="search"
              placeholder="搜索角色…"
              class="h-7 w-full rounded-md border border-input bg-background/60 pl-8 pr-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              @keydown.stop
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            class="h-7 shrink-0 gap-1 px-2 text-xs font-medium"
            title="新建角色"
            @click="createCharacter"
          >
            <Plus class="size-3.5" />
            <span>新建</span>
          </Button>
        </div>

        <DropdownMenuSeparator class="my-1" />

        <!-- Character items list with right-click and hover action buttons -->
        <div class="max-h-[260px] overflow-y-auto space-y-0.5" @wheel="handleWheel">
          <div
            v-for="(character, index) in filteredCharacters"
            :key="character.id"
            class="group/char relative flex items-center"
            @contextmenu.prevent.stop="openCharacterMenu(character.id, $event)"
          >
            <DropdownMenuItem
              :index="index"
              :checked="character.id === props.modelValue"
              :show-check="false"
              class="px-2 w-full pr-8"
              :class="isSidebar ? 'h-12' : 'h-11'"
              @select="handleValueChange(character.id)"
            >
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div class="grid shrink-0 place-items-center overflow-hidden rounded-full border border-border/50 bg-muted" :class="isSidebar ? 'size-7' : 'size-6'">
                  <img
                    v-if="character.avatarUrl"
                    :src="media.get(character.avatarUrl) ?? character.avatarUrl"
                    :alt="character.name"
                    class="size-full object-cover"
                  />
                  <UserRound v-else class="text-muted-foreground" :class="isSidebar ? 'size-3.5' : 'size-3'" />
                </div>
                <div class="min-w-0 flex-1 text-left">
                  <div class="truncate text-xs font-medium text-foreground">
                    {{ character.name }}
                  </div>
                  <div v-if="character.description" class="truncate text-[10px] text-muted-foreground">
                    {{ character.description }}
                  </div>
                </div>
              </div>
            </DropdownMenuItem>

            <button
              type="button"
              class="absolute right-2 z-20 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/char:opacity-100"
              :class="{ 'opacity-100': activeCharacterMenuId === character.id }"
              title="操作"
              @pointerdown.stop
              @click.stop="activeCharacterMenuId === character.id ? activeCharacterMenuId = null : openCharacterMenu(character.id, $event)"
            >
              <MoreHorizontal class="size-3.5" />
            </button>
          </div>

          <div v-if="!filteredCharacters.length" class="py-4 text-center text-xs text-muted-foreground">
            没有匹配的角色
          </div>
        </div>
        <div
          v-if="menuCharacter"
          class="absolute right-2 z-30 w-32 rounded-lg border border-border bg-popover p-1 text-xs text-popover-foreground shadow-xl"
          :style="{ top: `${menuTop}px` }"
          @pointerdown.stop
          @click.stop
        >
          <button type="button" class="flex w-full items-center rounded-md px-2 py-1.5 text-left hover:bg-accent" @click="handleRename(menuCharacter)">
            <Pencil class="mr-2 size-3.5" />重命名
          </button>
          <div class="my-1 h-px bg-border" />
          <button type="button" class="flex w-full items-center rounded-md px-2 py-1.5 text-left text-destructive hover:bg-accent" @click="handleDelete(menuCharacter)">
            <Trash2 class="mr-2 size-3.5" />删除角色
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
</template>
