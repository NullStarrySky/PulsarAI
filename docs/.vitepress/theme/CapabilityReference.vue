<script setup lang="ts">
import { computed, ref } from "vue";
import {
  capabilityDefinitions,
  fallbackCapabilityGrants,
} from "../../../src/features/Capabilities/application/capability-registry";
import {
  composeCapabilityRuntimePrompt,
  createCapabilityPrompt,
  normalizeSubCapIds,
  type CapabilityDefinition,
} from "../../../src/features/Capabilities/domain/capability";
import CapabilityGrantEditor from "../../../src/features/Capabilities/presentation/CapabilityGrantEditor.vue";
import { data as humanDocument } from "../../api/capability-reference.data.js";

const grants = ref(structuredClone(fallbackCapabilityGrants));
const viewMode = ref<"reference" | "preview">("reference");
const renderPromptMarkdown = ref(false);
const workbench = ref<HTMLElement | null>(null);

function grantedIds(definition: CapabilityDefinition) {
  return normalizeSubCapIds(definition, grants.value[definition.id] ?? []);
}

const promptPreview = computed(() => composeCapabilityRuntimePrompt(
  capabilityDefinitions.map((definition) =>
    createCapabilityPrompt(definition, grantedIds(definition))),
));

interface PromptMarkdownBlock {
  type: "heading" | "paragraph" | "list";
  level?: number;
  text?: string;
  items?: string[][];
}

function parsePromptMarkdown(source: string): PromptMarkdownBlock[] {
  const blocks: PromptMarkdownBlock[] = [];
  let listItems: string[][] = [];

  function flushList() {
    if (listItems.length === 0) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  }

  for (const sourceLine of source.split(/\r?\n/)) {
    const line = sourceLine.trimEnd();
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const listItem = /^-\s+(.+)$/.exec(line);
    const continuation = /^\s{2,}(.+)$/.exec(line);

    if (heading) {
      flushList();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2],
      });
    } else if (listItem) {
      listItems.push([listItem[1]]);
    } else if (continuation && listItems.length > 0) {
      listItems[listItems.length - 1].push(continuation[1]);
    } else if (line.trim()) {
      flushList();
      blocks.push({ type: "paragraph", text: line.trim() });
    } else {
      flushList();
    }
  }

  flushList();
  return blocks;
}

function inlineParts(text: string) {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((part) => ({
    code: part.startsWith("`") && part.endsWith("`"),
    text: part.startsWith("`") && part.endsWith("`") ? part.slice(1, -1) : part,
  }));
}

const promptMarkdownBlocks = computed(() => parsePromptMarkdown(promptPreview.value));

function showReference(targetId?: string) {
  viewMode.value = "reference";
  requestAnimationFrame(() => {
    (targetId ? document.getElementById(targetId) : workbench.value)?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
  });
}

function showPreview() {
  viewMode.value = "preview";
  requestAnimationFrame(() => {
    workbench.value?.scrollIntoView({
      behavior: "auto",
      block: "start",
    });
  });
}
</script>

<template>
  <div ref="workbench" class="capability-workbench">
    <main class="capability-reference-main">
      <article
        v-if="viewMode === 'reference'"
        class="capability-human-document"
        v-html="humanDocument.html"
      />

      <section v-else class="capability-prompt-preview">
        <div class="capability-prompt-note">
          <span>
            使用
            <code v-text="'{{CAPABILITIES_PROMPT}}'" />
            语法在上下文结构中引用以下内容。
          </span>
          <button
            type="button"
            class="capability-markdown-toggle"
            :aria-pressed="renderPromptMarkdown"
            @click="renderPromptMarkdown = !renderPromptMarkdown"
          >
            Markdown
          </button>
        </div>
        <div
          v-if="renderPromptMarkdown"
          class="capability-prompt-rendered"
          tabindex="0"
        >
          <template
            v-for="(block, blockIndex) in promptMarkdownBlocks"
            :key="blockIndex"
          >
            <component
              :is="`h${block.level}`"
              v-if="block.type === 'heading'"
            >
              <template
                v-for="(part, partIndex) in inlineParts(block.text ?? '')"
                :key="partIndex"
              >
                <code v-if="part.code">{{ part.text }}</code>
                <template v-else>{{ part.text }}</template>
              </template>
            </component>
            <p v-else-if="block.type === 'paragraph'">
              <template
                v-for="(part, partIndex) in inlineParts(block.text ?? '')"
                :key="partIndex"
              >
                <code v-if="part.code">{{ part.text }}</code>
                <template v-else>{{ part.text }}</template>
              </template>
            </p>
            <ul v-else>
              <li
                v-for="(lines, itemIndex) in block.items"
                :key="itemIndex"
              >
                <span
                  v-for="(itemLine, lineIndex) in lines"
                  :key="lineIndex"
                >
                  <br v-if="lineIndex > 0">
                  <template
                    v-for="(part, partIndex) in inlineParts(itemLine)"
                    :key="partIndex"
                  >
                    <code v-if="part.code">{{ part.text }}</code>
                    <template v-else>{{ part.text }}</template>
                  </template>
                </span>
              </li>
            </ul>
          </template>
        </div>
        <pre v-else tabindex="0"><code>{{ promptPreview }}</code></pre>
      </section>
    </main>

    <aside class="capability-reference-sidebar" aria-label="文档视图控制">
      <div class="capability-sidebar-inner">
        <div class="capability-view-switcher" aria-label="主页面显示内容">
          <button
            type="button"
            :aria-pressed="viewMode === 'reference'"
            @click="showReference()"
          >
            文档
          </button>
          <button
            type="button"
            :aria-pressed="viewMode === 'preview'"
            @click="showPreview"
          >
            发送预览
          </button>
        </div>

        <nav
          v-if="viewMode === 'reference'"
          class="capability-page-toc"
          aria-label="本页目录"
        >
          <h2>本页目录</h2>
          <div
            v-for="item in humanDocument.outline"
            :key="item.id"
            class="capability-toc-group"
          >
            <button
              type="button"
              class="capability-toc-feature"
              @click="showReference(item.id)"
            >
              {{ item.label }}
            </button>
            <button
              v-for="child in item.children"
              :key="child.id"
              type="button"
              class="capability-toc-child"
              @click="showReference(child.id)"
            >
              {{ child.label }}
            </button>
          </div>
        </nav>

        <section v-else class="capability-preview-controls">
          <header>
            <h2>权限选择</h2>
            <p>只读预览会随下方开关实时更新。</p>
          </header>
          <CapabilityGrantEditor v-model="grants" compact />
        </section>
      </div>
    </aside>
  </div>
</template>
