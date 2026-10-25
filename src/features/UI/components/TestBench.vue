<script setup lang="ts">
import { computed, ref } from "vue";
import { Badge, Button, Tabs, TabsList, TabsTrigger } from "@/components/fluid";
import {
	defaultModelSchema,
	type FormGenerator,
	type FormSchema,
	imageModelSchema,
} from "@/components/form-generator";
import { ScrollArea } from "@/components/ui/scroll-area";
import SettingsSidebar from "@/features/Environment/setting/SettingsSidebar.vue";
import { useEnvironmentStore } from "@/features/Environment/store";
import {
	ArrowsClockwise,
	Check,
	Clipboard,
	RotateCcw,
	Sliders,
	Sparkles,
} from "@/lib/remix-icons";

defineProps<{ sidebarWidth: number }>();
const environment = useEnvironmentStore();

// FormGenerator instance ref
const formGenRef = ref<InstanceType<typeof FormGenerator> | null>(null);

// Active schema reactive state (initialized with predefined model schema)
const schema = ref<FormSchema>(JSON.parse(JSON.stringify(defaultModelSchema)));

// Active tab for real-time results panel
const activeTab = ref<"values" | "schema">("values");
const copied = ref(false);

// Real-time extracted values object
const currentValues = computed(() => {
	const result: Record<string, unknown> = {};
	for (const item of schema.value) {
		result[item.id] = item.value;
	}
	return result;
});

// Count how many values differ from default
const modifiedCount = computed(() => {
	return schema.value.filter((item) => item.value !== item.default).length;
});

/** 还原默认: 将当前 Schema 中的所有项恢复为其默认值 */
function handleRestoreDefaults() {
	if (formGenRef.value) {
		formGenRef.value.resetToDefaults();
	} else {
		for (const item of schema.value) {
			item.value = item.default;
		}
	}
}

/** 清空: 将所有参数值清空为初始/空状态 */
function handleClearValues() {
	if (formGenRef.value) {
		formGenRef.value.clearValues();
	} else {
		for (const item of schema.value) {
			if (item.type === "switch") item.value = false;
			else if (item.type === "slider") item.value = item.min;
			else if (item.type === "select") item.value = item.options[0] ?? "";
			else item.value = "";
		}
	}
}

/** 重置为预设 Schema */
function loadPreset(preset: "default" | "image" | "empty") {
	if (preset === "default") {
		schema.value = JSON.parse(JSON.stringify(defaultModelSchema));
	} else if (preset === "image") {
		schema.value = JSON.parse(JSON.stringify(imageModelSchema));
	} else {
		schema.value = [];
	}
}

async function copyResult(content: string) {
	try {
		await navigator.clipboard.writeText(content);
		copied.value = true;
		setTimeout(() => {
			copied.value = false;
		}, 2000);
	} catch {
		// fallback
	}
}
</script>

<template>
  <div class="flex size-full overflow-hidden" :class="environment.glassEnabled ? 'bg-transparent' : 'bg-background'">
    <!-- Left Sidebar -->
    <div
      class="h-full max-w-full shrink-0 overflow-hidden border-r border-border/60"
      :class="environment.glassEnabled ? 'bg-sidebar/35 backdrop-blur-md' : 'bg-sidebar'"
      :style="{ width: `${sidebarWidth}px` }"
    >
      <SettingsSidebar class="h-full" />
    </div>

    <!-- Main Testbench Content Area -->
    <div class="flex min-w-0 flex-1 flex-col h-full overflow-hidden bg-background">
      <!-- Top Action Bar & Header -->
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-border/60 bg-muted/20">
        <div class="min-w-0">
          <div class="flex items-center gap-2.5">
            <h2 class="text-lg font-bold text-foreground/95">表单生成器测试台</h2>
            <Badge variant="outline" class="text-xs font-mono">TestBench</Badge>
          </div>
          <p class="text-xs text-muted-foreground mt-0.5">
            用于模型选择与参数配置的动态表单生成器，支持实时编辑、重新排序与结果预览。
          </p>
        </div>

        <!-- Presets and Global Actions -->
        <div class="flex flex-wrap items-center gap-2">
          <!-- Preset switcher -->
          <div class="flex items-center rounded-lg border border-border/70 p-0.5 bg-background text-xs">
            <button
              type="button"
              class="px-2.5 py-1 rounded-md transition-colors hover:bg-muted text-foreground/80 font-medium"
              title="载入语言模型配置预设"
              @click="loadPreset('default')"
            >
              LLM 预设
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md transition-colors hover:bg-muted text-foreground/80 font-medium"
              title="载入图像模型配置预设"
              @click="loadPreset('image')"
            >
              图像预设
            </button>
            <button
              type="button"
              class="px-2.5 py-1 rounded-md transition-colors hover:bg-muted text-foreground/80 font-medium"
              title="清空为完全空 Schema"
              @click="loadPreset('empty')"
            >
              空 Schema
            </button>
          </div>

          <!-- Clear Values button -->
          <Button
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            title="清空当前参数值"
            @click="handleClearValues"
          >
            <RotateCcw class="size-3.5" />
            <span>清空</span>
          </Button>

          <!-- Restore Defaults button -->
          <Button
            variant="outline"
            size="sm"
            class="h-8 gap-1.5 text-xs"
            title="将所有参数值还原为其默认值"
            @click="handleRestoreDefaults"
          >
            <ArrowsClockwise class="size-3.5" />
            <span>还原默认</span>
          </Button>

          <!-- Reset Predefined Schema button -->
          <Button
            variant="secondary"
            size="sm"
            class="h-8 gap-1.5 text-xs"
            title="重新载入初始预定义的 Schema"
            @click="loadPreset('default')"
          >
            <Sparkles class="size-3.5" />
            <span>重置预设</span>
          </Button>
        </div>
      </header>

      <!-- Main Body Split Area -->
      <div class="flex min-w-0 flex-1 flex-col lg:flex-row overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-border/60">
        <!-- Left: Form Generator Component Surface -->
        <div class="flex min-w-0 flex-1 flex-col h-full overflow-hidden">
          <ScrollArea class="h-full">
            <div class="p-6 max-w-4xl mx-auto">
              <div class="rounded-xl border border-border/80 bg-card p-6 shadow-xs">
                <FormGenerator
                  ref="formGenRef"
                  v-model="schema"
                  title="模型参数设置"
                  description="调整模型采样推理参数或通过右上角进入编辑模式新增、修改或重新排序参数。"
                />
              </div>
            </div>
          </ScrollArea>
        </div>

        <!-- Right: Real-time Results & Inspector Panel -->
        <div class="flex w-full lg:w-96 shrink-0 flex-col h-72 lg:h-full overflow-hidden bg-muted/10">
          <!-- Inspector Header -->
          <div class="flex items-center justify-between px-4 py-3 border-b border-border/60 bg-muted/30">
            <div class="flex items-center gap-2">
              <Sliders class="size-4 text-foreground/80" />
              <h3 class="text-sm font-semibold text-foreground/90">实时结果</h3>
              <Badge v-if="modifiedCount > 0" variant="secondary" class="text-[10px] px-1.5 py-0">
                {{ modifiedCount }} 项已修改
              </Badge>
            </div>

            <!-- Copy Button -->
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 gap-1 text-xs"
              @click="copyResult(JSON.stringify(activeTab === 'values' ? currentValues : schema, null, 2))"
            >
              <Check v-if="copied" class="size-3.5 text-green-500" />
              <Clipboard v-else class="size-3.5" />
              <span>{{ copied ? '已复制' : '复制 JSON' }}</span>
            </Button>
          </div>

          <!-- Inspector Tabs -->
          <div class="p-3 border-b border-border/50">
            <Tabs v-model="activeTab" class="w-full">
              <TabsList class="grid grid-cols-2 w-full">
                <TabsTrigger value="values" class="text-xs">
                  输出值 (Values)
                </TabsTrigger>
                <TabsTrigger value="schema" class="text-xs">
                  Schema 定义
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <!-- Inspector Content: Scrollable JSON View -->
          <div class="flex-1 overflow-hidden p-3">
            <ScrollArea class="h-full rounded-lg border border-border/70 bg-muted/40 p-3">
              <pre
                v-if="activeTab === 'values'"
                class="text-[11px] font-mono leading-relaxed text-foreground/90 select-text whitespace-pre-wrap break-all"
              >{{ JSON.stringify(currentValues, null, 2) }}</pre>
              <pre
                v-else
                class="text-[11px] font-mono leading-relaxed text-foreground/90 select-text whitespace-pre-wrap break-all"
              >{{ JSON.stringify(schema, null, 2) }}</pre>
            </ScrollArea>
          </div>

          <!-- Footer Stats -->
          <div class="px-4 py-2.5 border-t border-border/60 bg-muted/20 text-[11px] text-muted-foreground flex items-center justify-between font-mono">
            <span>总计: {{ schema.length }} 个配置项</span>
            <span>状态: {{ formGenRef?.isEditing ? '编辑模式' : '表单模式' }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
