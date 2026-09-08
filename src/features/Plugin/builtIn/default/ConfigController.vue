<template>
  <div class="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/95 p-3.5 shadow-sm backdrop-blur">
    <!-- Header -->
    <div class="flex items-center justify-between border-b pb-2">
      <div class="flex items-center gap-2">
        <span class="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
          <Settings2 class="size-3.5" />
        </span>
        <span class="text-xs font-semibold text-foreground">配置控制器</span>
      </div>
      <span
        class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
        :class="dirty ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'"
      >
        <span class="size-1.5 rounded-full" :class="dirty ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'" />
        {{ saving ? '保存中...' : dirty ? '未保存' : '已同步' }}
      </span>
    </div>

    <!-- Composable status info -->
    <div class="rounded-lg bg-muted/40 p-2 text-[11px] font-mono text-muted-foreground">
      <div class="flex items-center justify-between">
        <span>组合式函数:</span>
        <span class="font-semibold text-primary">useFileContent</span>
      </div>
      <div class="mt-1 flex items-center justify-between">
        <span>控制目标:</span>
        <span class="truncate">/self/config.json</span>
      </div>
    </div>

    <!-- Interactive Config Controls -->
    <div class="space-y-2.5 text-xs">
      <!-- Temperature slider -->
      <div class="space-y-1">
        <div class="flex items-center justify-between">
          <label class="text-[11px] font-medium text-muted-foreground">温度 (Temperature)</label>
          <span class="font-mono text-[11px] text-foreground tabular-nums">{{ configObject.temperature ?? 0.7 }}</span>
        </div>
        <input
          type="range"
          min="0"
          max="2"
          step="0.05"
          :value="configObject.temperature ?? 0.7"
          class="w-full accent-primary"
          @input="updateTemperature($event.target.valueAsNumber)"
        />
      </div>

      <!-- Max tokens input -->
      <div class="space-y-1">
        <label class="text-[11px] font-medium text-muted-foreground">最大 Token 数 (Max Tokens)</label>
        <input
          type="number"
          :value="configObject.maxTokens ?? 2048"
          class="h-7 w-full rounded-md border bg-background px-2 font-mono text-xs shadow-none outline-none focus:border-primary"
          @input="updateMaxTokens($event.target.valueAsNumber)"
        />
      </div>

      <!-- Debug Mode Toggle -->
      <div class="flex items-center justify-between pt-1">
        <label class="text-[11px] font-medium text-muted-foreground">调试模式 (Debug Mode)</label>
        <input
          type="checkbox"
          :checked="Boolean(configObject.debugMode)"
          class="size-4 accent-primary"
          @change="toggleDebugMode($event.target.checked)"
        />
      </div>

      <!-- Prompt Prefix -->
      <div class="space-y-1 pt-1">
        <label class="text-[11px] font-medium text-muted-foreground">系统提示前缀 (Prompt Prefix)</label>
        <input
          type="text"
          :value="configObject.promptPrefix ?? ''"
          placeholder="例如：请简洁作答..."
          class="h-7 w-full rounded-md border bg-background px-2 text-xs shadow-none outline-none focus:border-primary"
          @input="updatePromptPrefix($event.target.value)"
        />
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-2 pt-1 border-t">
      <button
        type="button"
        class="flex-1 rounded-lg bg-primary py-1.5 text-center text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        :disabled="!dirty || saving"
        @click="flush"
      >
        {{ saving ? '写入中...' : '立即写入文件' }}
      </button>
      <button
        type="button"
        class="rounded-lg border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        title="撤销未保存修改"
        @click="reset"
      >
        重置
      </button>
    </div>

    <!-- Raw JSON preview toggle -->
    <details class="text-[11px] text-muted-foreground">
      <summary class="cursor-pointer font-medium hover:text-foreground">查看 config.json 完整数据</summary>
      <pre class="mt-1.5 max-h-36 overflow-auto rounded-md bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">{{ JSON.stringify(value, null, 2) }}</pre>
    </details>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { Settings2 } from "lucide-vue-next";
import { useFileContent } from "@/features/Plugin/runtime/file-composables";

const { value, dirty, saving, flush, reset } = useFileContent("/self/config.json");

const configObject = computed(() => {
  if (value.value && typeof value.value === "object") {
    return value.value;
  }
  try {
    return JSON.parse(value.value || "{}");
  } catch {
    return {};
  }
});

function mutateConfig(updater) {
  const current = typeof value.value === "object" && value.value !== null
    ? { ...value.value }
    : {};
  updater(current);
  value.value = current;
}

function updateTemperature(temp) {
  mutateConfig(cfg => { cfg.temperature = temp; });
}

function updateMaxTokens(tokens) {
  mutateConfig(cfg => { cfg.maxTokens = tokens; });
}

function toggleDebugMode(checked) {
  mutateConfig(cfg => { cfg.debugMode = checked; });
}

function updatePromptPrefix(prefix) {
  mutateConfig(cfg => { cfg.promptPrefix = prefix; });
}
</script>
