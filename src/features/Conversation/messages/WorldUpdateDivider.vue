<script setup lang="ts">
import { computed, ref } from "vue";
import {
	Badge,
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "@/components/fluid";
import {
	Check,
	ChevronDown,
	ChevronUp,
	Code2,
	Copy,
	Database,
	EyeOff,
	FilePlus2,
	FolderPlus,
	Pencil,
	SlidersHorizontal,
	Trash2,
} from "lucide-vue-next";
import {
	describePulse,
	describePulseOperation,
	type Pulse,
	type PulseOperation,
} from "@/features/Plugin/tree/world-update";

const props = defineProps<{
	updates?: unknown[];
}>();

const rawUpdates = computed<Pulse[]>(() =>
	Array.isArray(props.updates) ? (props.updates as Pulse[]) : [],
);

interface DisplayItem {
	pulseId: string;
	time: string;
	description: string;
	scope: string;
	kind: string;
	icon: any;
}

function operationIcon(op: PulseOperation) {
	switch (op.kind) {
		case "file.meta.patch":
			if (op.patch.resourceSelected === true) return Check;
			if (op.patch.resourceSelected === false) return EyeOff;
			return SlidersHorizontal;
		case "file.write":
		case "file.replace":
			return Pencil;
		case "node.create":
			return op.node.type === "folder" ? FolderPlus : FilePlus2;
		case "node.delete":
			return Trash2;
		case "node.copy":
			return Copy;
		default:
			return SlidersHorizontal;
	}
}

const displayItems = computed<DisplayItem[]>(() => {
	const items: DisplayItem[] = [];
	for (const pulse of rawUpdates.value) {
		const time = pulse.createdAt
			? new Date(pulse.createdAt).toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
					second: "2-digit",
				})
			: "";
		for (const op of pulse.operations ?? []) {
			items.push({
				pulseId: pulse.id,
				time,
				description: describePulseOperation(op),
				scope: op.scope === "self" ? "本地" : "全局",
				kind: op.kind,
				icon: operationIcon(op),
			});
		}
	}
	return items;
});

const summaryText = computed(() => {
	const list = rawUpdates.value;
	if (!list.length) return "World 更新";
	const latest = list[list.length - 1];
	const latestDesc = describePulse(latest);
	if (list.length === 1 && (latest.operations?.length ?? 0) <= 1) {
		return `World 更新 · ${latestDesc}`;
	}
	const totalOps = displayItems.value.length;
	return `World 更新 · ${latestDesc} (共 ${totalOps} 项变更)`;
});

const showRawJson = ref(false);
const formattedJson = computed(() =>
	JSON.stringify(rawUpdates.value, null, 2),
);
</script>

<template>
  <div class="my-2 flex items-center gap-3 py-1 select-none">
    <span class="h-px flex-1 bg-border/60" />
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="group inline-flex items-center gap-1.5 rounded-full border border-dashed border-border/80 bg-background/80 px-3 py-1 text-xs text-muted-foreground transition-all hover:border-primary/50 hover:bg-muted/60 hover:text-foreground shadow-2xs"
          title="点击查看 World 更新详情"
        >
          <Database class="size-3 text-primary/70 group-hover:text-primary transition-colors" />
          <span class="max-w-[420px] truncate font-medium">{{ summaryText }}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="center"
        class="w-[min(26rem,calc(100vw-2rem))] p-0 shadow-lg rounded-xl overflow-hidden border bg-popover"
      >
        <div class="flex items-center justify-between border-b px-3.5 py-2.5 bg-muted/30">
          <div class="flex items-center gap-2">
            <Database class="size-4 text-primary" />
            <span class="text-xs font-semibold text-foreground">World 变更记录</span>
            <Badge variant="secondary" class="h-5 px-1.5 text-[10px] font-mono">
              {{ displayItems.length }} 项
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            class="size-6 text-muted-foreground hover:text-foreground"
            title="切换原始 JSON"
            @click="showRawJson = !showRawJson"
          >
            <Code2 class="size-3.5" />
          </Button>
        </div>

        <div v-if="showRawJson" class="max-h-72 overflow-auto p-3 text-[11px] font-mono bg-muted/40">
          <pre class="whitespace-pre-wrap leading-relaxed">{{ formattedJson }}</pre>
        </div>

        <div v-else class="max-h-72 overflow-auto divide-y divide-border/40 p-1">
          <div
            v-for="(item, idx) in displayItems"
            :key="idx"
            class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-muted/40 transition-colors text-xs"
          >
            <div class="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
              <component :is="item.icon" class="size-3" />
            </div>
            <div class="flex-1 min-w-0">
              <p class="truncate text-foreground font-medium leading-tight">
                {{ item.description }}
              </p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <Badge variant="outline" class="h-4 px-1 text-[9px] font-normal text-muted-foreground">
                {{ item.scope }}
              </Badge>
              <span v-if="item.time" class="text-[10px] text-muted-foreground/80 font-mono tabular-nums">
                {{ item.time }}
              </span>
            </div>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
    <span class="h-px flex-1 bg-border/60" />
  </div>
</template>
