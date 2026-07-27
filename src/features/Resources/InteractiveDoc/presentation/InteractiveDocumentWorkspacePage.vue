<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  Box,
  Braces,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  FileText,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import JavaScriptCodeMirrorEditor from "@/features/Resources/Preset/presentation/JavaScriptCodeMirrorEditor.vue";
import { createInteractiveDocumentDemo } from "../application/interactive-document-demo";
import {
  createInteractiveDocument,
  defaultInteractiveVariableRenderers,
  type InteractiveBlockType,
  type InteractiveDocumentBlock,
  type InteractiveDocumentData,
  type InteractiveVariableBlock,
  type InteractiveValue,
} from "../domain/interactive-document";

const documentData = reactive(createInteractiveDocumentDemo()) as InteractiveDocumentData;
const document = createInteractiveDocument(documentData);
const activeBlockId = ref(documentData.blocks.find((block) => block.type === "text")?.id ?? documentData.blocks[0]?.id ?? "");
const previewMode = ref<"output" | "variables">("output");
const variableDraft = ref("");
const variableDraftError = ref("");
const componentPropsDraft = ref("");
const componentPropsError = ref("");

const activeBlock = computed(() => document.getBlock(activeBlockId.value) ?? null);
const activeTextBlock = computed(() =>
  activeBlock.value?.type === "text" ? activeBlock.value : null,
);
const activeVariableBlock = computed(() =>
  activeBlock.value?.type === "variable" ? activeBlock.value : null,
);
const activeComponentBlock = computed(() =>
  activeBlock.value?.type === "component" ? activeBlock.value : null,
);
const variableBlocks = computed(() =>
  documentData.blocks.filter((block): block is InteractiveVariableBlock => block.type === "variable"),
);
const compiledResult = computed(() => document.compileDetailed());
const variableSnapshot = computed(() =>
  JSON.stringify(
    Object.fromEntries(variableBlocks.value.map((block) => [block.id, block.value])),
    null,
    2,
  ),
);
const activeTextMarkdown = computed({
  get: () => {
    const block = activeTextBlock.value;
    return block?.content[block.activeContentIndex] ?? "";
  },
  set: (markdown: string) => {
    const block = activeTextBlock.value;
    if (block) {
      document.updateTextContent(block.id, block.activeContentIndex, markdown);
    }
  },
});
const activeComponentFallback = computed({
  get: () => activeComponentBlock.value?.fallbackMarkdown ?? "",
  set: (markdown: string) => {
    if (activeComponentBlock.value) {
      activeComponentBlock.value.fallbackMarkdown = markdown;
    }
  },
});

watch(
  () => activeBlock.value?.id,
  () => {
    if (activeVariableBlock.value) {
      variableDraft.value = JSON.stringify(activeVariableBlock.value.value, null, 2);
      variableDraftError.value = "";
    }
    if (activeComponentBlock.value) {
      componentPropsDraft.value = JSON.stringify(activeComponentBlock.value.props, null, 2);
      componentPropsError.value = "";
    }
  },
  { immediate: true },
);

watch(variableDraft, (source) => {
  const block = activeVariableBlock.value;
  if (!block) {
    return;
  }
  try {
    block.value = JSON.parse(source) as InteractiveValue;
    variableDraftError.value = "";
  } catch (error) {
    variableDraftError.value = error instanceof Error ? error.message : String(error);
  }
});

watch(componentPropsDraft, (source) => {
  const block = activeComponentBlock.value;
  if (!block) {
    return;
  }
  try {
    const value = JSON.parse(source) as unknown;
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error("组件参数必须是 JSON 对象");
    }
    block.props = value as Record<string, InteractiveValue>;
    componentPropsError.value = "";
  } catch (error) {
    componentPropsError.value = error instanceof Error ? error.message : String(error);
  }
});

function blockIcon(type: InteractiveBlockType) {
  if (type === "text") {
    return FileText;
  }
  if (type === "variable") {
    return Braces;
  }
  return Box;
}

function blockTypeName(type: InteractiveBlockType) {
  if (type === "text") {
    return "文本";
  }
  if (type === "variable") {
    return "变量";
  }
  return "组件";
}

function addBlock(type: InteractiveBlockType) {
  let block: InteractiveDocumentBlock;
  if (type === "text") {
    block = document.createBlock({
      type,
      content: ["## 新文本块\n\n"],
      variableIds: variableBlocks.value.map((item) => item.id),
    });
  } else if (type === "variable") {
    block = document.createBlock({
      type,
      value: "",
      rendererId: "auto",
    });
  } else {
    block = document.createBlock({
      type,
      componentId: "",
      props: {},
      fallbackMarkdown: "",
    });
  }
  activeBlockId.value = block.id;
}

function deleteBlock(blockId: string) {
  const index = documentData.blocks.findIndex((block) => block.id === blockId);
  if (!document.deleteBlock(blockId)) {
    return;
  }
  activeBlockId.value = documentData.blocks[Math.min(index, documentData.blocks.length - 1)]?.id ?? "";
}

function moveBlock(blockId: string, offset: number) {
  const index = documentData.blocks.findIndex((block) => block.id === blockId);
  document.moveBlock(blockId, index + offset);
}

function addTextVersion() {
  const block = activeTextBlock.value;
  if (block) {
    document.addTextContent(block.id, block.content[block.activeContentIndex] ?? "");
  }
}

function removeTextVersion() {
  const block = activeTextBlock.value;
  if (block) {
    document.removeTextContent(block.id, block.activeContentIndex);
  }
}

function setTextVersion(index: number) {
  const block = activeTextBlock.value;
  if (block) {
    document.setActiveTextContent(block.id, index);
  }
}

function toggleVariableBinding(variableId: string, enabled: boolean) {
  const block = activeTextBlock.value;
  if (!block) {
    return;
  }
  block.variableIds = enabled
    ? [...new Set([...block.variableIds, variableId])]
    : block.variableIds.filter((id) => id !== variableId);
}

async function copyCompiledMarkdown() {
  await navigator.clipboard.writeText(compiledResult.value.markdown);
}
</script>

<template>
  <div data-testid="interactive-document-workspace" class="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_16rem] overflow-hidden bg-background xl:grid-cols-[15rem_minmax(0,1fr)_20rem] xl:grid-rows-1 mobile:grid-cols-1 mobile:grid-rows-[10rem_minmax(0,1fr)_12rem]">
    <aside class="flex min-h-0 flex-col border-r bg-muted/10 mobile:border-b mobile:border-r-0">
      <header class="flex min-h-16 items-center gap-2 border-b px-3 mobile:min-h-12">
        <div class="min-w-0 flex-1">
          <input
            v-model="documentData.name"
            class="w-full truncate bg-transparent text-sm font-semibold outline-none"
            aria-label="文档名称"
          />
          <input
            v-model="documentData.description"
            class="mt-0.5 w-full truncate bg-transparent text-xs text-muted-foreground outline-none"
            aria-label="文档描述"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="icon-sm" variant="ghost" title="新增块">
              <Plus />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-40">
            <DropdownMenuItem @click="addBlock('text')">
              <FileText class="mr-2 size-4" />
              文本块
            </DropdownMenuItem>
            <DropdownMenuItem @click="addBlock('variable')">
              <Braces class="mr-2 size-4" />
              变量块
            </DropdownMenuItem>
            <DropdownMenuItem @click="addBlock('component')">
              <Box class="mr-2 size-4" />
              组件块
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div class="min-h-0 flex-1 overflow-y-auto p-2 mobile:flex mobile:gap-1 mobile:overflow-x-auto mobile:overflow-y-hidden">
        <div
          v-for="(block, index) in documentData.blocks"
          :key="block.id"
          class="group mb-0.5 flex min-h-12 items-center gap-2 rounded-md px-2 transition-colors mobile:mb-0 mobile:min-w-40 mobile:shrink-0"
          :class="[
            block.id === activeBlockId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/55',
            block.hidden && 'opacity-55',
          ]"
        >
          <button
            class="flex min-w-0 flex-1 items-center gap-2 text-left"
            type="button"
            :data-testid="`interactive-block-${block.id}`"
            @click="activeBlockId = block.id"
          >
            <component :is="blockIcon(block.type)" class="size-4 shrink-0 text-muted-foreground" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-medium">{{ block.name }}</span>
              <span class="block truncate text-[11px] text-muted-foreground">{{ blockTypeName(block.type) }}</span>
            </span>
          </button>
          <Button
            size="icon-xs"
            variant="ghost"
            :title="block.hidden ? '显示块' : '隐藏块'"
            class="mobile-touch-actions opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            @click="document.setBlockHidden(block.id, !block.hidden)"
          >
            <EyeOff v-if="block.hidden" />
            <Eye v-else />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                size="icon-xs"
                variant="ghost"
                title="块菜单"
                class="mobile-touch-actions opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-36">
              <DropdownMenuItem :disabled="index === 0" @click="moveBlock(block.id, -1)">
                <ChevronUp class="mr-2 size-4" />
                上移
              </DropdownMenuItem>
              <DropdownMenuItem :disabled="index === documentData.blocks.length - 1" @click="moveBlock(block.id, 1)">
                <ChevronDown class="mr-2 size-4" />
                下移
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem class="text-destructive focus:text-destructive" @click="deleteBlock(block.id)">
                <Trash2 class="mr-2 size-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div v-if="documentData.blocks.length === 0" class="px-3 py-10 text-center text-sm text-muted-foreground">
          暂无块
        </div>
      </div>
    </aside>

    <main class="flex min-h-0 min-w-0 flex-col">
      <template v-if="activeBlock">
        <header class="flex min-h-16 items-center gap-3 border-b px-5 mobile:min-h-14 mobile:gap-2 mobile:px-3">
          <component :is="blockIcon(activeBlock.type)" class="size-5 shrink-0 text-muted-foreground" />
          <div class="min-w-0 flex-1">
            <input
              v-model="activeBlock.name"
              class="w-full bg-transparent text-base font-semibold outline-none"
              aria-label="块名称"
            />
            <input
              v-model="activeBlock.description"
              class="mt-0.5 w-full bg-transparent text-sm text-muted-foreground outline-none"
              aria-label="块描述"
              placeholder="描述"
            />
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            :title="activeBlock.hidden ? '显示块' : '隐藏块'"
            @click="document.setBlockHidden(activeBlock.id, !activeBlock.hidden)"
          >
            <EyeOff v-if="activeBlock.hidden" />
            <Eye v-else />
          </Button>
          <Button size="icon-sm" variant="ghost" class="text-destructive hover:text-destructive" title="删除块" @click="deleteBlock(activeBlock.id)">
            <Trash2 />
          </Button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5 [scrollbar-gutter:stable] mobile:px-3 mobile:py-3">
          <section v-if="activeTextBlock" class="mx-auto grid w-full max-w-[820px] gap-5">
            <div class="flex min-h-9 items-center gap-1 border-b">
              <button
                v-for="(_content, index) in activeTextBlock.content"
                :key="index"
                type="button"
                :data-testid="`text-version-${index}`"
                class="relative h-9 px-2 text-sm transition-colors after:absolute after:inset-x-1 after:bottom-[-1px] after:h-px"
                :class="index === activeTextBlock.activeContentIndex
                  ? 'font-medium text-foreground after:bg-foreground'
                  : 'text-muted-foreground after:bg-transparent hover:text-foreground'"
                @click="setTextVersion(index)"
              >
                版本 {{ index + 1 }}
              </button>
              <Button size="icon-xs" variant="ghost" class="ml-1" title="新增版本" @click="addTextVersion">
                <Plus />
              </Button>
              <Button size="icon-xs" variant="ghost" title="删除当前版本" @click="removeTextVersion">
                <Trash2 />
              </Button>
              <span class="flex-1" />
              <span class="text-xs text-muted-foreground">
                {{ activeTextBlock.activeContentIndex + 1 }}/{{ activeTextBlock.content.length }}
              </span>
            </div>

            <div class="interactive-doc-markdown-editor min-h-[20rem] rounded-lg bg-muted/20 px-12 py-4 mobile:px-3 mobile:py-3">
              <ConversationComposerEditor
                v-model="activeTextMarkdown"
                placeholder="输入 Markdown，可使用 {{variable}} 宏"
                enable-block-edit
                :enable-ai="false"
              />
            </div>

            <section>
              <div class="flex h-9 items-center border-b">
                <h2 class="text-sm font-semibold">绑定变量</h2>
                <span class="ml-2 text-xs text-muted-foreground">{{ activeTextBlock.variableIds.length }}/{{ variableBlocks.length }}</span>
              </div>
              <div class="grid gap-1 py-2 sm:grid-cols-2">
                <label
                  v-for="variable in variableBlocks"
                  :key="variable.id"
                  class="flex min-h-10 items-center gap-3 rounded-md px-2.5 text-sm transition-colors hover:bg-accent/45"
                >
                  <Switch
                    size="sm"
                    :model-value="activeTextBlock.variableIds.includes(variable.id)"
                    @update:model-value="toggleVariableBinding(variable.id, Boolean($event))"
                  />
                  <span class="min-w-0 flex-1 truncate">{{ variable.name }}</span>
                  <span class="truncate text-xs text-muted-foreground">{{ variable.id }}</span>
                </label>
                <div v-if="variableBlocks.length === 0" class="py-5 text-sm text-muted-foreground">
                  暂无变量块
                </div>
              </div>
            </section>
          </section>

          <section v-else-if="activeVariableBlock" class="mx-auto grid w-full max-w-[820px] gap-5">
            <div class="grid gap-1.5">
              <label class="text-xs font-medium text-muted-foreground">渲染器</label>
              <Select v-model="activeVariableBlock.rendererId">
                <SelectTrigger class="h-9 w-52 rounded-none border-0 border-b bg-transparent px-0 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="renderer in defaultInteractiveVariableRenderers" :key="renderer.id" :value="renderer.id">
                    {{ renderer.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="grid gap-2">
              <div class="flex h-8 items-center justify-between border-b">
                <h2 class="text-sm font-semibold">变量值</h2>
                <span class="text-xs text-muted-foreground">{{ activeVariableBlock.id }}</span>
              </div>
              <div class="h-[min(460px,55vh)] min-h-64 overflow-hidden rounded-lg bg-muted/20">
                <JavaScriptCodeMirrorEditor v-model="variableDraft" language="json" frameless />
              </div>
              <p v-if="variableDraftError" class="text-xs text-destructive">{{ variableDraftError }}</p>
            </div>
          </section>

          <section v-else-if="activeComponentBlock" class="mx-auto grid w-full max-w-[820px] gap-5">
            <label class="grid gap-1.5">
              <span class="text-xs font-medium text-muted-foreground">组件 ID</span>
              <input
                v-model="activeComponentBlock.componentId"
                class="h-9 border-b bg-transparent text-sm outline-none"
                placeholder="external/component-id"
              />
            </label>
            <div class="grid gap-2">
              <div class="flex h-8 items-center justify-between border-b">
                <h2 class="text-sm font-semibold">组件参数</h2>
                <span class="text-xs text-muted-foreground">JSON</span>
              </div>
              <div class="h-52 overflow-hidden rounded-lg bg-muted/20">
                <JavaScriptCodeMirrorEditor v-model="componentPropsDraft" language="json" frameless />
              </div>
              <p v-if="componentPropsError" class="text-xs text-destructive">{{ componentPropsError }}</p>
            </div>
            <div class="grid gap-2">
              <div class="flex h-8 items-center border-b">
                <h2 class="text-sm font-semibold">Markdown 回退</h2>
              </div>
              <div class="interactive-doc-component-fallback min-h-40 rounded-lg bg-muted/20 px-5 py-3">
                <ConversationComposerEditor
                  v-model="activeComponentFallback"
                  placeholder="外部组件不可用时输出的 Markdown"
                  :enable-ai="false"
                />
              </div>
            </div>
          </section>
        </div>
      </template>

      <div v-else class="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        选择或新建一个块
      </div>
    </main>

    <aside class="col-span-2 flex min-h-0 flex-col border-t bg-muted/10 xl:col-span-1 xl:border-l xl:border-t-0 mobile:col-span-1">
      <header class="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <button
          type="button"
          class="h-8 px-2 text-sm transition-colors"
          :class="previewMode === 'output' ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="previewMode = 'output'"
        >
          编译结果
        </button>
        <button
          type="button"
          class="h-8 px-2 text-sm transition-colors"
          :class="previewMode === 'variables' ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="previewMode = 'variables'"
        >
          变量
        </button>
        <span class="flex-1" />
        <Button v-if="previewMode === 'output'" size="icon-sm" variant="ghost" title="复制 Markdown" @click="copyCompiledMarkdown">
          <Copy />
        </Button>
      </header>

      <div class="min-h-0 flex-1 overflow-auto p-4 [scrollbar-gutter:stable] mobile:p-3">
        <pre v-if="previewMode === 'output'" data-testid="compiled-markdown" class="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">{{ compiledResult.markdown }}</pre>
        <pre v-else data-testid="variable-snapshot" class="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">{{ variableSnapshot }}</pre>
        <p v-if="previewMode === 'output' && !compiledResult.markdown" class="text-sm text-muted-foreground">
          暂无可编译内容
        </p>
      </div>

      <div v-if="compiledResult.errors.length" class="shrink-0 border-t px-4 py-3">
        <p v-for="error in compiledResult.errors" :key="`${error.blockId}:${error.message}`" class="text-xs text-destructive">
          {{ error.blockId }}: {{ error.message }}
        </p>
      </div>
    </aside>
  </div>
</template>

<style>
.interactive-doc-markdown-editor :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: 20rem !important;
  max-height: none !important;
}

.interactive-doc-component-fallback :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: 8rem !important;
  max-height: none !important;
}

.mobile-layout .interactive-doc-markdown-editor :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: 14rem !important;
}
</style>
