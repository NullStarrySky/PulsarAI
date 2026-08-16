<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Check,
  CheckCircle2,
  Code2,
  Copy,
  FileCode2,
  FolderOpen,
  Info,
  Sliders,
  Terminal,
  XCircle,
} from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import ConversationMarkdown from "@/features/Conversation/stage/ConversationMarkdown.vue";
import type { TraceLogEntry } from "@/features/Plugin/runtime/plugin-test";

const props = defineProps<{
  logs: TraceLogEntry[] | null;
  value?: unknown;
  error?: string | null;
  sourcePath?: string;
  sourceContent?: string;
}>();

const indentLogs = ref(true);
const copied = ref(false);
const copiedValue = ref(false);
const copiedSourcePath = ref(false);
const copiedSourceContent = ref(false);

const valueMarkdown = computed(() => {
  if (props.value == null) return "";
  return typeof props.value === "string"
    ? props.value
    : JSON.stringify(props.value, null, 2) ?? "";
});

const chatMessages = computed<Array<{
  role: "system" | "user" | "assistant";
  content: string;
}> | null>(() => {
  const value = props.value;
  if (!value || typeof value !== "object" || !("message" in value)) return null;
  const messages = (value as { message?: unknown }).message;
  if (!Array.isArray(messages)) return null;
  const parsed: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const { role, content } = message as { role?: unknown; content?: unknown };
    if (
      (role === "system" || role === "user" || role === "assistant")
      && typeof content === "string"
    ) parsed.push({ role, content });
  }
  return parsed.length === messages.length ? parsed : null;
});

function chatRoleClass(role: "system" | "user" | "assistant") {
  if (role === "system") return "border-amber-500/30 bg-amber-500/5";
  if (role === "user") return "border-sky-500/30 bg-sky-500/5";
  return "border-emerald-500/30 bg-emerald-500/5";
}

const formattedTraceText = computed(() => {
  if (!props.logs || props.logs.length === 0) return "";
  return props.logs
    .map((entry) => {
      const prefix = indentLogs.value ? "  ".repeat(entry.depth) : "";
      return `${prefix}[${entry.type.toUpperCase()}] ${entry.message}`;
    })
    .join("\n");
});

async function copyTraceLogs() {
  if (!formattedTraceText.value) return;
  try {
    await navigator.clipboard.writeText(formattedTraceText.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch {
    // fallback
  }
}

async function copyFinalValue() {
  if (props.value === undefined || props.value === null) return;
  try {
    await navigator.clipboard.writeText(valueMarkdown.value);
    copiedValue.value = true;
    setTimeout(() => {
      copiedValue.value = false;
    }, 2000);
  } catch {
    // Clipboard access may be unavailable in restricted renderer contexts.
  }
}

async function copySourcePath() {
  if (!props.sourcePath) return;
  try {
    await navigator.clipboard.writeText(props.sourcePath);
    copiedSourcePath.value = true;
    setTimeout(() => {
      copiedSourcePath.value = false;
    }, 2000);
  } catch {
    // Clipboard access may be unavailable in restricted renderer contexts.
  }
}

async function copySourceContent() {
  if (props.sourceContent === undefined) return;
  try {
    await navigator.clipboard.writeText(props.sourceContent);
    copiedSourceContent.value = true;
    setTimeout(() => {
      copiedSourceContent.value = false;
    }, 2000);
  } catch {
    // Clipboard access may be unavailable in restricted renderer contexts.
  }
}

function typeBadgeVariant(type: TraceLogEntry["type"]) {
  switch (type) {
    case "import":
      return "outline";
    case "container":
      return "secondary";
    case "config":
      return "secondary";
    case "condition":
      return "default";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

function typeIcon(type: TraceLogEntry["type"]) {
  switch (type) {
    case "import":
      return FileCode2;
    case "container":
      return FolderOpen;
    case "config":
      return Sliders;
    case "condition":
      return Code2;
    case "error":
      return XCircle;
    default:
      return Info;
  }
}
</script>

<template>
  <div class="plugin-parse-result-trace space-y-3 font-mono text-xs select-none">
    <!-- Controls Header -->
    <div class="flex items-center justify-between border-b pb-2">
      <div class="flex items-center gap-2">
        <Terminal class="w-4 h-4 text-primary" />
        <span class="font-semibold text-foreground">Trace 轨迹日志</span>
        <Badge v-if="logs" variant="outline" class="text-[10px] px-1.5 py-0">
          {{ logs.length }} 条记录
        </Badge>
      </div>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch id="indent-logs" v-model:checked="indentLogs" class="scale-75" />
          <Label for="indent-logs" class="cursor-pointer text-[11px] select-none">
            层级缩进
          </Label>
        </div>

        <Button
          v-if="logs && logs.length > 0"
          variant="ghost"
          size="icon"
          class="h-7 w-7"
          title="复制 Trace 日志"
          @click="copyTraceLogs"
        >
          <Check v-if="copied" class="w-3.5 h-3.5 text-emerald-500" />
          <Copy v-else class="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </div>
    </div>

    <!-- Global Error Alert -->
    <div v-if="error" class="p-2.5 rounded-md bg-destructive/10 border border-destructive/30 text-destructive space-y-1">
      <div class="flex items-center gap-1.5 font-semibold">
        <XCircle class="w-4 h-4" />
        <span>解析过程发生错误</span>
      </div>
      <p class="text-[11px] leading-relaxed break-all font-mono opacity-90 pl-5">
        {{ error }}
      </p>
    </div>

    <!-- Empty State -->
    <div v-if="!logs || logs.length === 0" class="text-muted-foreground p-4 text-center italic border rounded-md border-dashed">
      暂无 Trace 日志，点击“测试解析”执行跟踪。
    </div>

    <!-- Trace Logs Terminal List -->
    <div v-else class="rounded-md border bg-muted/40 p-2.5 space-y-1.5 max-h-[320px] overflow-y-auto font-mono text-[11px] leading-snug">
      <div
        v-for="(entry, idx) in logs"
        :key="idx"
        class="flex items-start gap-1.5 transition-colors hover:bg-muted/80 rounded px-1 py-0.5"
        :style="{ paddingLeft: indentLogs ? `${entry.depth * 14 + 4}px` : '4px' }"
      >
        <span class="text-muted-foreground/60 select-none text-[10px] shrink-0 w-5">
          {{ idx + 1 }}.
        </span>
        <Badge :variant="typeBadgeVariant(entry.type)" class="text-[9px] px-1 py-0 h-4 shrink-0 font-mono tracking-tight">
          <component :is="typeIcon(entry.type)" class="w-2.5 h-2.5 mr-0.5 inline" />
          {{ entry.type.toUpperCase() }}
        </Badge>

        <span
          class="break-all whitespace-pre-wrap flex-1"
          :class="{
            'text-destructive font-semibold': entry.type === 'error',
            'text-emerald-500 font-medium': entry.type === 'condition',
            'text-amber-500 font-medium': entry.type === 'config',
            'text-purple-400 font-medium': entry.type === 'container',
            'text-foreground': entry.type === 'import',
          }"
        >
          {{ entry.message }}
        </span>
      </div>
    </div>

    <!-- Final Value Result Output -->
    <div v-if="value !== undefined && value !== null" class="space-y-1 pt-1 border-t">
      <div class="flex items-center justify-between gap-2 text-xs text-muted-foreground font-semibold">
        <div class="flex items-center gap-1.5">
          <CheckCircle2 class="w-3.5 h-3.5 text-emerald-500" />
          <span>最终解析结果 (Markdown):</span>
        </div>
        <div class="flex items-center gap-0.5">
          <Button v-if="sourcePath" variant="ghost" size="icon" class="h-7 w-7" title="复制源文件路径" @click="copySourcePath">
            <Check v-if="copiedSourcePath" class="w-3.5 h-3.5 text-emerald-500" />
            <Copy v-else class="w-3.5 h-3.5" />
          </Button>
          <Button v-if="sourceContent !== undefined" variant="ghost" size="icon" class="h-7 w-7" title="复制源文件内容" @click="copySourceContent">
            <Check v-if="copiedSourceContent" class="w-3.5 h-3.5 text-emerald-500" />
            <Copy v-else class="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" class="h-7 w-7" title="复制解析结果" @click="copyFinalValue">
            <Check v-if="copiedValue" class="w-3.5 h-3.5 text-emerald-500" />
            <Copy v-else class="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
      <div class="max-h-64 overflow-y-auto rounded border bg-muted/60 p-2.5 text-foreground/90">
        <div v-if="chatMessages" class="space-y-2 font-sans">
          <article
            v-for="(message, index) in chatMessages"
            :key="`${message.role}-${index}`"
            class="rounded-lg border p-2.5"
            :class="chatRoleClass(message.role)"
          >
            <Badge variant="outline" class="mb-1.5 text-[10px] uppercase">{{ message.role }}</Badge>
            <ConversationMarkdown :model-value="message.content" compact />
          </article>
        </div>
        <ConversationMarkdown v-else :model-value="valueMarkdown" compact />
      </div>
    </div>
  </div>
</template>
