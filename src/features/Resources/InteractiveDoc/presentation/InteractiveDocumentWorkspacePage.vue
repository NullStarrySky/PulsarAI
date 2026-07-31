<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { AlertCircle, Eye, FileCode2, Plus, Trash2 } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import ConversationMarkdown from "@/features/Resources/Conversation/presentation/ConversationMarkdown.vue";
import { createInteractiveDocumentDemo } from "../application/interactive-document-demo";
import {
  compileInteractiveDocumentSource,
  parseInteractiveDocumentSource,
  serializeInteractiveDocumentSource,
  type InteractiveDataContentType,
  type InteractiveDocumentSource,
  type InteractivePromptRole,
} from "../domain/interactive-document";
import type {
  PluginReferenceSuggestion,
} from "@/features/Resources/Plugin/domain/plugin-reference";

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    readonly?: boolean;
    resolveReference?: (target: string) => unknown;
    referenceDiagnostics?: string[];
    referenceSuggestions?: PluginReferenceSuggestion[];
  }>(),
  {
    readonly: false,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

const activeTab = ref(props.readonly ? "preview" : "edit");
const source = computed(() => props.modelValue ?? createInteractiveDocumentDemo());
const document = computed(() => parseInteractiveDocumentSource(source.value));
const referenceSuggestions = computed<PluginReferenceSuggestion[]>(() => [
  ...document.value.data.map((item) => ({
    target: `local:${item.name}`,
    label: item.name,
    detail: `local · ${item.contentType}`,
    description: item.description.trim() || undefined,
  })),
  ...(props.referenceSuggestions ?? []),
]);
const preview = computed(() => {
  const result = compileInteractiveDocumentSource(source.value, {
    environment: {
      chat: [],
      CHAT: [],
      now: () => new Date().toISOString(),
    },
    resolveReference: props.resolveReference,
  });
  return {
    ...result,
    errors: [
      ...result.errors,
      ...(props.referenceDiagnostics ?? []).map((message, index) => ({
        sourceId: `reference:${index + 1}`,
        message,
      })),
    ],
  };
});

watch(
  () => props.readonly,
  (readonly) => {
    if (readonly && activeTab.value === "edit") activeTab.value = "preview";
  },
);

function updateDocument(
  mutate: (draft: InteractiveDocumentSource) => void,
) {
  if (props.readonly) return;
  const draft = parseInteractiveDocumentSource(source.value);
  mutate(draft);
  emit("update:modelValue", serializeInteractiveDocumentSource(draft));
}

function updateRawSource(value: string) {
  if (!props.readonly) emit("update:modelValue", value);
}

function addTemplate() {
  updateDocument((draft) => {
    draft.templates.push({
      id: `prompt:${crypto.randomUUID()}`,
      name: `template-${draft.templates.length + 1}`,
      role: "system",
      content: "",
    });
  });
}

function removeTemplate(index: number) {
  updateDocument((draft) => {
    draft.templates.splice(index, 1);
  });
}

function updateTemplate(
  index: number,
  patch: Partial<{
    name: string;
    role: InteractivePromptRole;
    content: string;
  }>,
) {
  updateDocument((draft) => {
    const template = draft.templates[index];
    if (template) Object.assign(template, patch);
  });
}

function addSubData() {
  updateDocument((draft) => {
    const name = uniqueDataName(draft, "data");
    draft.data.push({
      id: `data:${crypto.randomUUID()}`,
      name,
      enableUpdater: false,
      description: "",
      contentType: "json",
      content: "null",
      wrapper: "",
    });
  });
}

function removeSubData(index: number) {
  updateDocument((draft) => {
    draft.data.splice(index, 1);
  });
}

function updateSubData(
  index: number,
  patch: Partial<{
    name: string;
    enableUpdater: boolean;
    description: string;
    contentType: InteractiveDataContentType;
    content: string;
    wrapper: string;
  }>,
) {
  updateDocument((draft) => {
    const item = draft.data[index];
    if (item) Object.assign(item, patch);
  });
}

function uniqueDataName(document: InteractiveDocumentSource, base: string) {
  const names = new Set(document.data.map((item) => item.name));
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function updateCompressionThreshold(event: Event) {
  const value = Number.parseInt(
    (event.target as HTMLInputElement).value,
    10,
  );
  updateDocument((draft) => {
    draft.memory.compressionThreshold = Number.isFinite(value) && value > 0
      ? Math.max(4, value)
      : 0;
  });
}
</script>

<template>
  <div
    data-testid="interactive-document-workspace"
    class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
  >
    <Tabs v-model="activeTab" class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-12 items-center justify-between gap-3 border-b px-4 mobile:px-3">
        <div class="flex min-w-0 items-center gap-2">
          <FileCode2 class="size-4 shrink-0 text-muted-foreground" />
          <span class="truncate text-sm font-medium">Interactive Document</span>
          <Badge variant="secondary" class="hidden font-mono text-[10px] sm:inline-flex">
            SFC
          </Badge>
        </div>
        <TabsList class="h-8">
          <TabsTrigger v-if="!readonly" value="edit" class="h-7 px-3 text-xs">
            编辑
          </TabsTrigger>
          <TabsTrigger value="source" class="h-7 px-3 text-xs">
            源码
          </TabsTrigger>
          <TabsTrigger value="preview" class="h-7 px-3 text-xs">
            <Eye class="mr-1 size-3.5" />
            预览
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        v-if="!readonly"
        value="edit"
        class="mt-0 min-h-0 flex-1 overflow-y-auto"
      >
        <div class="mx-auto w-full max-w-[920px] space-y-8 px-6 pb-24 pt-8 mobile:px-3 mobile:pb-14 mobile:pt-5">
          <section>
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="text-sm font-semibold">Prompt Templates</h2>
                <p class="mt-1 text-xs text-muted-foreground">
                  模板按顺序编译为带角色的消息；引用标记会在 Milkdown 中高亮。
                </p>
              </div>
              <Button size="sm" variant="outline" class="h-8" @click="addTemplate">
                <Plus class="mr-1 size-3.5" />
                模板
              </Button>
            </div>

            <div class="space-y-4">
              <article
                v-for="(template, index) in document.templates"
                :key="template.id"
                class="overflow-hidden rounded-lg border bg-card"
              >
                <header class="flex min-h-11 items-center gap-2 border-b px-3">
                  <input
                    :value="template.name"
                    class="h-8 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                    aria-label="模板名称"
                    @change="updateTemplate(index, { name: ($event.target as HTMLInputElement).value })"
                  />
                  <Select
                    :model-value="template.role"
                    @update:model-value="updateTemplate(index, { role: String($event) as InteractivePromptRole })"
                  >
                    <SelectTrigger class="h-8 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">system</SelectItem>
                      <SelectItem value="user">user</SelectItem>
                      <SelectItem value="assistant">assistant</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="size-8"
                    title="删除模板"
                    @click="removeTemplate(index)"
                  >
                    <Trash2 class="size-3.5" />
                  </Button>
                </header>
                <ConversationComposerEditor
                  :model-value="template.content"
                  enable-block-edit
                  enable-reference-syntax
                  :reference-suggestions="referenceSuggestions"
                  :enable-ai="false"
                  placeholder=""
                  class="interactive-doc-template-editor px-4 py-3"
                  @update:model-value="updateTemplate(index, { content: $event })"
                />
              </article>

              <p
                v-if="!document.templates.length"
                class="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground"
              >
                当前没有模板。
              </p>
            </div>
          </section>

          <section>
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 class="text-sm font-semibold">Data</h2>
                <p class="mt-1 text-xs text-muted-foreground">
                  每项数据通过 <code>&lt;@local:name&gt;</code> 显式访问。
                </p>
              </div>
              <Button size="sm" variant="outline" class="h-8" @click="addSubData">
                <Plus class="mr-1 size-3.5" />
                数据
              </Button>
            </div>

            <div class="grid grid-cols-2 gap-3 mobile:grid-cols-1">
              <article
                v-for="(item, index) in document.data"
                :key="item.id"
                class="min-w-0 rounded-lg border bg-card p-3"
              >
                <div class="flex items-center gap-2">
                  <input
                    :value="item.name"
                    class="h-8 min-w-0 flex-1 border-b bg-transparent font-mono text-sm outline-none"
                    aria-label="数据名称"
                    @change="updateSubData(index, { name: ($event.target as HTMLInputElement).value })"
                  />
                  <Select
                    :model-value="item.contentType"
                    @update:model-value="updateSubData(index, { contentType: String($event) as InteractiveDataContentType })"
                  >
                    <SelectTrigger class="h-8 w-24 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">json</SelectItem>
                      <SelectItem value="value">value</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="size-8"
                    title="删除数据"
                    @click="removeSubData(index)"
                  >
                    <Trash2 class="size-3.5" />
                  </Button>
                </div>

                <label class="mt-3 flex items-center justify-between gap-3 text-xs">
                  <span>
                    <span class="font-medium">enable_updater</span>
                    <span class="ml-1 text-muted-foreground">允许消息绑定更新函数</span>
                  </span>
                  <Switch
                    size="sm"
                    :model-value="item.enableUpdater"
                    @update:model-value="updateSubData(index, { enableUpdater: Boolean($event) })"
                  />
                </label>

                <textarea
                  :value="item.description"
                  rows="2"
                  class="mt-3 block w-full resize-y rounded-md border bg-transparent px-2.5 py-2 text-xs leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="description"
                  @input="updateSubData(index, { description: ($event.target as HTMLTextAreaElement).value })"
                />
                <textarea
                  :value="item.content"
                  rows="6"
                  class="mt-2 block w-full resize-y rounded-md border bg-muted/10 px-2.5 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  :placeholder="item.contentType === 'json' ? '{}' : 'value'"
                  @input="updateSubData(index, { content: ($event.target as HTMLTextAreaElement).value })"
                />
                <textarea
                  :value="item.wrapper"
                  rows="6"
                  class="mt-2 block w-full resize-y rounded-md border bg-muted/10 px-2.5 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="function (value) { return value; }"
                  aria-label="变量包装器函数"
                  @input="updateSubData(index, { wrapper: ($event.target as HTMLTextAreaElement).value })"
                />
              </article>
            </div>
          </section>

          <section class="rounded-lg border bg-card p-4">
            <h2 class="text-sm font-semibold">压缩式记忆</h2>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">
              当激活路径积累到阈值后，主生成流程会压缩最早的连续静态区间；设为 0 表示关闭。
            </p>
            <label class="mt-3 flex items-center justify-between gap-4 text-sm">
              <span>容器阈值</span>
              <input
                :value="document.memory.compressionThreshold"
                type="number"
                min="0"
                step="1"
                class="h-9 w-28 rounded-md border bg-background px-3 text-right font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
                @change="updateCompressionThreshold"
              />
            </label>
          </section>
        </div>
      </TabsContent>

      <TabsContent value="source" class="mt-0 min-h-0 flex-1">
        <textarea
          :value="source"
          :readonly="readonly"
          spellcheck="false"
          class="h-full w-full resize-none bg-background p-5 font-mono text-[13px] leading-6 outline-none mobile:p-3"
          aria-label="IMD 源码"
          @input="updateRawSource(($event.target as HTMLTextAreaElement).value)"
        />
      </TabsContent>

      <TabsContent
        value="preview"
        class="mt-0 min-h-0 flex-1 overflow-y-auto bg-muted/10"
      >
        <div class="mx-auto w-full max-w-[860px] px-6 pb-20 pt-8 mobile:px-3 mobile:pb-12 mobile:pt-5">
          <div
            v-if="preview.errors.length"
            class="mb-5 space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3"
          >
            <div class="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle class="size-4" />
              解析诊断
            </div>
            <p
              v-for="error in preview.errors"
              :key="`${error.sourceId}:${error.message}`"
              class="font-mono text-xs leading-5 text-destructive"
            >
              {{ error.sourceId }} · {{ error.message }}
            </p>
          </div>

          <div class="space-y-4">
            <article
              v-for="(message, index) in preview.messages"
              :key="`${message.role}:${index}`"
              class="rounded-lg border bg-card px-5 py-4 mobile:px-3"
            >
              <Badge variant="outline" class="mb-3 font-mono text-[10px]">
                {{ message.role }}
              </Badge>
              <ConversationMarkdown
                :model-value="typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)"
              />
            </article>

            <p
              v-if="!preview.messages.length"
              class="rounded-lg border border-dashed py-14 text-center text-sm text-muted-foreground"
            >
              当前文档没有可预览的 Prompt Template。
            </p>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<style>
.interactive-doc-template-editor :where(.milkdown, .editor, .ProseMirror) {
  min-height: 8rem !important;
  max-height: none !important;
}

.interactive-doc-template-editor :where(.milkdown, .editor) {
  overflow: visible !important;
}
</style>
