<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Sliders, Settings, ListOrdered, FileText, Plus, Trash2 } from "lucide-vue-next";
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

const props = defineProps<{
	modelValue: string | Record<string, any>;
	editable?: boolean;
}>();

const emit = defineEmits<{
	"update:modelValue": [value: string];
}>();

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

const prompts = computed<any[]>({
	get: () => {
		if (Array.isArray(internalData.value.prompts)) return internalData.value.prompts;
		return [];
	},
	set: (val) => {
		internalData.value.prompts = val;
		notifyUpdate();
	},
});

function addPrompt() {
	const newPrompt = {
		identifier: `custom_${Date.now()}`,
		name: "自定义提示词",
		role: "system",
		content: "",
		enabled: true,
	};
	if (!Array.isArray(internalData.value.prompts)) {
		internalData.value.prompts = [];
	}
	internalData.value.prompts.push(newPrompt);
	notifyUpdate();
}

function removePrompt(index: number) {
	if (Array.isArray(internalData.value.prompts)) {
		internalData.value.prompts.splice(index, 1);
		notifyUpdate();
	}
}

function updateParam(key: string, val: any) {
	internalData.value[key] = val;
	notifyUpdate();
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-2 p-3">
    <!-- Top summary bar -->
    <div class="flex items-center justify-between gap-3 border-b pb-2.5">
      <div class="flex items-center gap-2">
        <span class="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
          <Sliders class="size-4" />
        </span>
        <div>
          <h3 class="text-xs font-semibold leading-none text-foreground">
            {{ internalData.name || 'SillyTavern 预设 (Preset)' }}
          </h3>
          <p class="mt-1 text-[10px] text-muted-foreground">
            {{ prompts.length }} 个提示词模板 · 采样配置已就绪
          </p>
        </div>
      </div>
    </div>

    <!-- Main Accordion Sections -->
    <ScrollArea class="min-h-0 flex-1 pr-2">
      <Accordion type="multiple" :default-value="['prompts', 'samplers']" class="space-y-2.5">
        <!-- Prompts Section -->
        <AccordionItem value="prompts" class="rounded-xl border border-border/70 bg-card/80 transition shadow-xs">
          <AccordionTrigger class="px-3.5 py-2.5 hover:no-underline">
            <div class="flex items-center gap-2">
              <FileText class="size-4 text-primary" />
              <span class="text-xs font-semibold text-foreground">提示词模板列表 (Prompts)</span>
              <Badge variant="secondary" class="h-4.5 px-1.5 text-[10px]">{{ prompts.length }}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent class="border-t border-border/50 px-3.5 pb-3 pt-2.5 space-y-3 bg-muted/15 rounded-b-xl">
            <div class="flex items-center justify-end">
              <Button size="sm" class="h-6 gap-1 px-2 text-[11px]" @click="addPrompt">
                <Plus class="size-3" />添加提示词
              </Button>
            </div>

            <div v-for="(p, idx) in prompts" :key="p.identifier || idx" class="rounded-lg border bg-background/90 p-2.5 space-y-2 shadow-2xs">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <Switch
                    size="sm"
                    :model-value="p.enabled !== false"
                    @update:model-value="p.enabled = $event; notifyUpdate()"
                  />
                  <Input
                    :model-value="p.name ?? p.identifier ?? `提示词 #${idx + 1}`"
                    class="h-6 max-w-48 text-xs font-medium shadow-none"
                    @update:model-value="p.name = $event; notifyUpdate()"
                  />
                  <Badge variant="outline" class="font-mono text-[10px]">{{ p.role ?? 'system' }}</Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  class="size-6 text-muted-foreground hover:text-destructive"
                  title="删除提示词"
                  @click="removePrompt(idx)"
                >
                  <Trash2 class="size-3" />
                </Button>
              </div>
              <textarea
                :value="p.content ?? ''"
                rows="3"
                placeholder="输入提示词内容..."
                class="w-full resize-y rounded-md border bg-muted/30 p-2 font-mono text-[11px] leading-relaxed outline-none focus:border-primary shadow-none"
                @input="p.content = ($event.target as HTMLTextAreaElement).value; notifyUpdate()"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        <!-- Samplers / Parameters Section -->
        <AccordionItem value="samplers" class="rounded-xl border border-border/70 bg-card/80 transition shadow-xs">
          <AccordionTrigger class="px-3.5 py-2.5 hover:no-underline">
            <div class="flex items-center gap-2">
              <Settings class="size-4 text-primary" />
              <span class="text-xs font-semibold text-foreground">模型与采样参数 (Samplers)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent class="border-t border-border/50 px-3.5 pb-3.5 pt-3 space-y-3 bg-muted/15 rounded-b-xl text-xs">
            <div class="grid grid-cols-2 gap-3">
              <!-- Temperature -->
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-medium text-muted-foreground">温度 (Temperature)</label>
                  <span class="font-mono tabular-nums text-[11px]">{{ internalData.temperature ?? 1 }}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.05"
                  :value="internalData.temperature ?? 1"
                  class="w-full accent-primary"
                  @input="updateParam('temperature', ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </div>

              <!-- Top P -->
              <div class="space-y-1">
                <div class="flex items-center justify-between">
                  <label class="text-[11px] font-medium text-muted-foreground">Top P</label>
                  <span class="font-mono tabular-nums text-[11px]">{{ internalData.top_p ?? 1 }}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="internalData.top_p ?? 1"
                  class="w-full accent-primary"
                  @input="updateParam('top_p', ($event.target as HTMLInputElement).valueAsNumber)"
                />
              </div>

              <!-- Repetition Penalty -->
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted-foreground">重复惩罚 (Repetition Penalty)</label>
                <Input
                  type="number"
                  step="0.05"
                  :model-value="internalData.repetition_penalty ?? 1"
                  class="h-7 text-xs bg-background shadow-none font-mono"
                  @update:model-value="updateParam('repetition_penalty', Number($event))"
                />
              </div>

              <!-- Max Context Length -->
              <div class="space-y-1">
                <label class="text-[11px] font-medium text-muted-foreground">最大上下文长度 (Max Context)</label>
                <Input
                  type="number"
                  :model-value="internalData.max_context_length ?? 4096"
                  class="h-7 text-xs bg-background shadow-none font-mono"
                  @update:model-value="updateParam('max_context_length', Number($event))"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <!-- Prompt Order Section -->
        <AccordionItem value="order" class="rounded-xl border border-border/70 bg-card/80 transition shadow-xs">
          <AccordionTrigger class="px-3.5 py-2.5 hover:no-underline">
            <div class="flex items-center gap-2">
              <ListOrdered class="size-4 text-primary" />
              <span class="text-xs font-semibold text-foreground">提示词排序 (Prompt Order)</span>
            </div>
          </AccordionTrigger>
          <AccordionContent class="border-t border-border/50 px-3.5 pb-3 pt-2.5 space-y-2 bg-muted/15 rounded-b-xl text-xs">
            <p class="text-[11px] text-muted-foreground">按顺序执行并注入上下文：</p>
            <div class="flex flex-wrap gap-1.5">
              <Badge
                v-for="(p, i) in prompts"
                :key="p.identifier || i"
                variant="outline"
                class="gap-1 px-2 py-1 font-mono text-[11px]"
              >
                <span class="text-muted-foreground">{{ i + 1 }}.</span>
                {{ p.name || p.identifier }}
              </Badge>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </ScrollArea>
  </div>
</template>
