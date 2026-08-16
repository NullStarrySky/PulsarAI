<script setup lang="ts">
import { computed } from "vue";
import { MarkdownRender } from "markstream-vue";
import "markstream-vue/index.css";
import "katex/dist/katex.min.css";
import { usePluginStore } from "@/features/Resources/Plugin/tree/plugin-store";
import { resolveTempComponent } from "@/features/Resources/Conversation/stage/conversation-plugin-vue-reference";

export interface ConversationMarkdownSelection {
  from: number;
  to: number;
  text: string;
}

const props = withDefaults(
  defineProps<{
    modelValue: string;
    compact?: boolean;
    pluginId?: string;
    mode?: "chat" | "docs";
  }>(),
  {
    modelValue: "",
    compact: false,
    pluginId: "",
    mode: undefined,
  },
);

const emit = defineEmits<{
  annotate: [selection: ConversationMarkdownSelection];
}>();

const activeMode = computed(() => props.mode || (props.compact ? "chat" : "docs"));

const codeBlockProps = computed(() => ({
  theme: {
    light: "vitesse-dark",
    dark: "vitesse-dark",
  },
}));

const isDark = computed(() => {
  if (typeof document === "undefined") return true;
  return document.documentElement.classList.contains("dark");
});

const pluginStore = usePluginStore();
const ownerPlugin = computed(() =>
  pluginStore.sortedPlugins.find((plugin) => plugin.id === props.pluginId),
);

interface MarkdownSegment {
  type: "markdown" | "vue";
  content: string;
  filename?: string;
}

const vueReferencePattern = /<([A-Za-z0-9][A-Za-z0-9._-]*\.vue)\s*\/>/gi;

const segments = computed<MarkdownSegment[]>(() => {
  const text = props.modelValue ?? "";
  if (!text) return [];
  const result: MarkdownSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  vueReferencePattern.lastIndex = 0;
  while ((match = vueReferencePattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      result.push({
        type: "markdown",
        content: text.slice(lastIndex, match.index),
      });
    }
    result.push({
      type: "vue",
      content: match[0],
      filename: match[1],
    });
    lastIndex = vueReferencePattern.lastIndex;
  }

  if (lastIndex < text.length) {
    result.push({
      type: "markdown",
      content: text.slice(lastIndex),
    });
  }

  return result;
});

function getVueComponent(filename?: string) {
  if (!filename) return null;
  return resolveTempComponent(ownerPlugin.value, filename).component;
}

function handleContextMenu(event: MouseEvent) {
  const selectionObj = window.getSelection();
  if (!selectionObj || selectionObj.isCollapsed) return;
  const text = selectionObj.toString().trim();
  if (!text) return;
  event.preventDefault();
  emit("annotate", {
    from: 0,
    to: text.length,
    text,
  });
}
</script>

<template>
  <div
    class="conversation-markstream markstream-vue"
    :class="{ 'conversation-markstream--compact': props.compact }"
    :data-mode="activeMode"
    @contextmenu="handleContextMenu"
  >
    <template v-for="(segment, idx) in segments" :key="idx">
      <MarkdownRender
        v-if="segment.type === 'markdown'"
        :content="segment.content"
        :mode="activeMode"
        :is-dark="isDark"
        :code-block-props="codeBlockProps"
        :custom-id="`msg-render-${idx}`"
      />
      <div v-else-if="segment.type === 'vue'" class="pulsar-vue-reference my-2">
        <component :is="getVueComponent(segment.filename)" />
      </div>
    </template>
  </div>
</template>

<style>
.conversation-markstream.markstream-vue,
.conversation-markstream .markstream-vue {
  --ms-text-body: var(--editor-font-size, 14px) !important;
  --ms-leading-body: var(--editor-line-height, 1.5) !important;
  --ms-flow-paragraph-y: 0.5em !important;
  --ms-font-sans: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif);
  --ms-font-mono: var(--font-mono, var(--font-code, ui-monospace, SFMono-Regular, Consolas, monospace));
  color: var(--foreground);
}

.conversation-markstream .paragraph-node,
.conversation-markstream p {
  font-size: var(--ms-text-body) !important;
  line-height: var(--ms-leading-body) !important;
}

.conversation-markstream .paragraph-node:first-child,
.conversation-markstream p:first-child {
  margin-top: 0 !important;
}

.conversation-markstream .paragraph-node:last-child,
.conversation-markstream p:last-child {
  margin-bottom: 0 !important;
}

.conversation-markstream--compact {
  --ms-flow-paragraph-y: 0.35em;
  --ms-flow-list-y: 0.25em;
  --ms-flow-list-item-y: 0.1em;
  --ms-flow-heading-1-mt: 0.4em;
  --ms-flow-heading-1-mb: 0.3em;
  --ms-flow-heading-2-mt: 0.5em;
  --ms-flow-heading-2-mb: 0.25em;
  --ms-flow-heading-3-mt: 0.4em;
  --ms-flow-heading-3-mb: 0.2em;
  --ms-flow-codeblock-y: 0.4em;
  --ms-flow-table-y: 0.4em;
  --ms-flow-diagram-y: 0.4em;
  --ms-flow-blockquote-y: 0.4em;
}

.conversation-markstream pre,
.conversation-markstream .table-node-wrapper,
.conversation-markstream .mermaid,
.conversation-markstream .d2-node-wrapper {
  max-width: 100%;
  overflow-x: auto;
}

.conversation-markstream img {
  max-width: 100%;
  height: auto;
  border-radius: var(--radius);
}

.conversation-markstream .katex-display {
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.25rem 0;
  margin: 0.5em 0;
}

.pulsar-rewrite-annotation {
  border-bottom: 2px solid color-mix(in srgb, var(--primary), transparent 35%);
  background: color-mix(in srgb, var(--primary), transparent 88%);
  border-radius: 2px;
}

.pulsar-vue-reference {
  margin: 0.5rem 0;
}

.pulsar-vue-reference-error {
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--muted-foreground);
  font-size: 0.875rem;
  padding: 0.75rem;
}
</style>
