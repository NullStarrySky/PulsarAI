<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { BookOpen, Plus, Search, Trash2, Tag, SlidersHorizontal } from "lucide-vue-next";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
	Badge,
	Button,
	Switch,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface StWorldbookEntry {
	uid?: number | string;
	key?: string[];
	secondary_keys?: string[];
	comment?: string;
	content?: string;
	constant?: boolean;
	selective?: boolean;
	order?: number;
	position?: number;
	enabled?: boolean;
	[key: string]: any;
}

const props = defineProps<{
	modelValue: string | Record<string, any>;
	editable?: boolean;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

const search = ref("");
const internalData = ref<Record<string, any>>({});

watch(
	() => props.modelValue,
	(val) => {
		try {
			if (typeof val === "string") {
				internalData.value = JSON.parse(val || "{}");
			} else if (val && typeof val === "object") {
				internalData.value = JSON.parse(JSON.stringify(val));
			}
		} catch {
			internalData.value = {};
		}
	},
	{ immediate: true },
);

function notifyUpdate() {
	emit("update:modelValue", JSON.stringify(internalData.value, null, 2));
}

const rawEntries = computed<StWorldbookEntry[]>(() => {
	const entries = internalData.value.entries;
	if (Array.isArray(entries)) return entries;
	if (entries && typeof entries === "object") return Object.values(entries);
	return [];
});

const filteredEntries = computed(() => {
	const q = search.value.trim().toLowerCase();
	if (!q) return rawEntries.value;
	return rawEntries.value.filter((entry) => {
		const matchComment = entry.comment?.toLowerCase().includes(q);
		const matchKeys = entry.key?.some((k) => k.toLowerCase().includes(q));
		const matchContent = entry.content?.toLowerCase().includes(q);
		return matchComment || matchKeys || matchContent;
	});
});

const enabledCount = computed(
	() => rawEntries.value.filter((e) => e.enabled !== false).length,
);

function addEntry() {
	const newUid = Date.now();
	const newEntry: StWorldbookEntry = {
		uid: newUid,
		comment: "新世界书条目",
		key: ["关键词"],
		content: "",
		enabled: true,
		order: 100,
		position: 0,
	};
	if (Array.isArray(internalData.value.entries)) {
		internalData.value.entries.unshift(newEntry);
	} else if (
		internalData.value.entries &&
		typeof internalData.value.entries === "object"
	) {
		internalData.value.entries[String(newUid)] = newEntry;
	} else {
		internalData.value.entries = [newEntry];
	}
	notifyUpdate();
}

function removeEntry(index: number, uid?: string | number) {
	if (Array.isArray(internalData.value.entries)) {
		internalData.value.entries.splice(index, 1);
	} else if (
		internalData.value.entries &&
		typeof internalData.value.entries === "object" &&
		uid !== undefined
	) {
		delete internalData.value.entries[String(uid)];
	}
	notifyUpdate();
}

function updateKeys(entry: StWorldbookEntry, text: string) {
	entry.key = text
		.split(/[,，\n]/)
		.map((k) => k.trim())
		.filter(Boolean);
	notifyUpdate();
}

function updateSecondaryKeys(entry: StWorldbookEntry, text: string) {
	entry.secondary_keys = text
		.split(/[,，\n]/)
		.map((k) => k.trim())
		.filter(Boolean);
	notifyUpdate();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2 p-3">
    <!-- Top toolbar -->
    <div class="flex items-center justify-between gap-3 border-b pb-2.5">
      <div class="flex items-center gap-2">
        <span class="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <BookOpen class="size-4" />
        </span>
        <div>
          <h3 class="text-xs font-semibold leading-none text-foreground">
            {{ internalData.name || 'SillyTavern 世界书 / Lorebook' }}
          </h3>
          <p class="mt-1 text-[10px] text-muted-foreground">
            共 {{ rawEntries.length }} 个条目 · {{ enabledCount }} 个已启用
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="relative w-40">
          <Search class="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" placeholder="过滤条目…" class="h-7 pl-7 text-xs shadow-none" />
        </div>
        <Button size="sm" class="h-7 gap-1 px-2 text-xs" @click="addEntry">
          <Plus class="size-3.5" />添加条目
        </Button>
      </div>
    </div>

    <!-- Accordion List -->
    <ScrollArea class="min-h-0 flex-1 pr-2">
      <div v-if="filteredEntries.length === 0" class="py-16 text-center text-xs text-muted-foreground">
        暂无匹配的世界书条目
      </div>
      <Accordion v-else type="multiple" class="space-y-2">
        <AccordionItem
          v-for="(entry, index) in filteredEntries"
          :key="String(entry.uid ?? index)"
          :value="String(entry.uid ?? index)"
          class="rounded-xl border border-border/70 bg-card/80 transition shadow-xs hover:border-border"
        >
          <AccordionTrigger class="px-3 py-2 text-left hover:no-underline">
            <div class="flex min-w-0 flex-1 items-center gap-2 pr-2">
              <Switch
                size="sm"
                :model-value="entry.enabled !== false"
                class="shrink-0"
                @click.stop
                @update:model-value="entry.enabled = $event; notifyUpdate()"
              />
              <span class="truncate font-medium text-xs text-foreground">
                {{ entry.comment || `条目 #${index + 1}` }}
              </span>
              <div class="flex flex-wrap items-center gap-1">
                <Badge
                  v-for="k in (entry.key || []).slice(0, 3)"
                  :key="k"
                  variant="secondary"
                  class="h-4.5 px-1.5 text-[10px] font-mono"
                >
                  <Tag class="mr-0.5 size-2.5 opacity-60" />{{ k }}
                </Badge>
                <span v-if="(entry.key || []).length > 3" class="text-[10px] text-muted-foreground">
                  +{{ entry.key.length - 3 }}
                </span>
              </div>
              <span class="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                优先级: {{ entry.order ?? 100 }}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent class="border-t border-border/50 px-3 pb-3 pt-2 text-xs space-y-2.5 bg-muted/15 rounded-b-xl">
            <!-- 备注名与权重 -->
            <div class="grid grid-cols-[minmax(0,1fr)_8rem] gap-2">
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted-foreground">条目注释 / 标题</label>
                <Input
                  :model-value="entry.comment ?? ''"
                  placeholder="例如：主要角色设定"
                  class="h-7 text-xs bg-background shadow-none"
                  @update:model-value="entry.comment = $event; notifyUpdate()"
                />
              </div>
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted-foreground">插入权重 / Order</label>
                <Input
                  type="number"
                  :model-value="entry.order ?? 100"
                  class="h-7 text-xs bg-background shadow-none tabular-nums"
                  @update:model-value="entry.order = Number($event); notifyUpdate()"
                />
              </div>
            </div>

            <!-- 触发关键词 -->
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-muted-foreground">触发关键词 (主键，逗号分隔)</label>
              <Input
                :model-value="(entry.key || []).join(', ')"
                placeholder="例如：Pulsar, 助手, 飞船"
                class="h-7 text-xs bg-background shadow-none font-mono"
                @update:model-value="updateKeys(entry, $event)"
              />
            </div>

            <!-- 次要关键词 / 排除策略 -->
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-muted-foreground">次要关键词 / 逻辑与 (Secondary Keys)</label>
              <Input
                :model-value="(entry.secondary_keys || []).join(', ')"
                placeholder="可选，仅当主键与次要键均匹配时激活"
                class="h-7 text-xs bg-background shadow-none font-mono"
                @update:model-value="updateSecondaryKeys(entry, $event)"
              />
            </div>

            <!-- 内容 -->
            <div class="space-y-1">
              <label class="text-[11px] font-medium text-muted-foreground">提示词条目正文 (Prompt Content)</label>
              <textarea
                :value="entry.content ?? ''"
                rows="4"
                placeholder="输入该条目要注入上下文的提示词文本..."
                class="w-full resize-y rounded-lg border bg-background p-2 font-mono text-xs leading-relaxed outline-none focus:border-primary shadow-none"
                @input="entry.content = ($event.target as HTMLTextAreaElement).value; notifyUpdate()"
              />
            </div>

            <!-- Footer: Delete action -->
            <div class="flex items-center justify-between pt-1 border-t border-border/40">
              <span class="text-[10px] text-muted-foreground">UID: {{ entry.uid ?? '自动分配' }}</span>
              <Button
                variant="ghost"
                size="sm"
                class="h-6 gap-1 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                @click="removeEntry(index, entry.uid)"
              >
                <Trash2 class="size-3" />删除条目
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </ScrollArea>
  </div>
</template>
