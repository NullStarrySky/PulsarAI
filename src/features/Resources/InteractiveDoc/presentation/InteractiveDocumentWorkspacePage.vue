<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import {
  Box,
  Braces,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import ConversationComposerEditor from "@/features/Resources/Conversation/presentation/ConversationComposerEditor.vue";
import JavaScriptCodeMirrorEditor from "@/features/Resources/Preset/presentation/JavaScriptCodeMirrorEditor.vue";
import { createInteractiveDocumentDemo } from "../application/interactive-document-demo";
import {
  createInteractiveDocument,
  defaultInteractiveVariableRenderers,
  type InteractiveComponentBlock,
  type InteractiveBlockRole,
  type InteractiveDocumentBlock,
  type InteractiveDocumentData,
  type InteractiveTextBlock,
  type InteractiveValue,
  type InteractiveVariableBlock,
} from "../domain/interactive-document";

type DocumentRow =
  | { id: string; kind: "variables"; blocks: InteractiveVariableBlock[] }
  | { id: string; kind: "block"; block: InteractiveTextBlock | InteractiveComponentBlock };

const props = defineProps<{
  modelValue?: InteractiveDocumentData;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: InteractiveDocumentData];
}>();

const documentData = reactive(
  cloneDocumentData(props.modelValue ?? createInteractiveDocumentDemo()),
) as InteractiveDocumentData;
const document = createInteractiveDocument(documentData);
const collapsedBlockIds = ref(new Set<string>());
const editingDescriptionId = ref("");
const variableDrafts = reactive<Record<string, string>>({});
const variableErrors = reactive<Record<string, string>>({});
const componentPropsDrafts = reactive<Record<string, string>>({});
const componentPropsErrors = reactive<Record<string, string>>({});
const roleOptions: Array<{
  value: "default" | InteractiveBlockRole;
  label: string;
}> = [
  { value: "default", label: "默认 · assistant" },
  { value: "system", label: "system" },
  { value: "user", label: "user" },
  { value: "assistant", label: "assistant" },
];

watch(
  documentData,
  () => {
    if (props.modelValue) {
      emit("update:modelValue", cloneDocumentData(documentData));
    }
  },
  { deep: true },
);

const variableBlocks = computed(() =>
  documentData.blocks.filter(
    (block): block is InteractiveVariableBlock => block.type === "variable",
  ),
);

const documentRows = computed<DocumentRow[]>(() => {
  const rows: DocumentRow[] = [];
  let variables: InteractiveVariableBlock[] = [];

  const flushVariables = () => {
    if (!variables.length) return;
    rows.push({
      id: `variables:${variables.map((block) => block.id).join(":")}`,
      kind: "variables",
      blocks: variables,
    });
    variables = [];
  };

  for (const block of documentData.blocks) {
    if (block.type === "variable") {
      variables.push(block);
      continue;
    }
    flushVariables();
    rows.push({ id: block.id, kind: "block", block });
  }
  flushVariables();
  return rows;
});

function addBlock(type: InteractiveDocumentBlock["type"]) {
  if (type === "text") {
    document.createBlock({
      type,
      content: ["## 新段落\n\n"],
      variableIds: variableBlocks.value.map((item) => item.id),
    });
    return;
  }
  if (type === "variable") {
    document.createBlock({
      type,
      value: "",
      rendererId: "auto",
    });
    return;
  }
  document.createBlock({
    type,
    componentId: "",
    props: {},
    fallbackMarkdown: "",
  });
}

function deleteBlock(blockId: string) {
  document.deleteBlock(blockId);
  collapsedBlockIds.value.delete(blockId);
  collapsedBlockIds.value = new Set(collapsedBlockIds.value);
  if (editingDescriptionId.value === blockId) {
    editingDescriptionId.value = "";
  }
}

function moveBlock(blockId: string, offset: number) {
  const index = documentData.blocks.findIndex((block) => block.id === blockId);
  document.moveBlock(blockId, index + offset);
}

function toggleCollapsed(blockId: string) {
  const next = new Set(collapsedBlockIds.value);
  if (next.has(blockId)) next.delete(blockId);
  else next.add(blockId);
  collapsedBlockIds.value = next;
}

function isCollapsed(blockId: string) {
  return collapsedBlockIds.value.has(blockId);
}

function textMarkdown(block: InteractiveTextBlock) {
  return block.content[block.activeContentIndex] ?? "";
}

function updateTextMarkdown(block: InteractiveTextBlock, markdown: string) {
  document.updateTextContent(block.id, block.activeContentIndex, markdown);
}

function setTextVersion(block: InteractiveTextBlock, index: number) {
  document.setActiveTextContent(block.id, index);
}

function previousTextVersion(block: InteractiveTextBlock) {
  setTextVersion(
    block,
    (block.activeContentIndex - 1 + block.content.length) % block.content.length,
  );
}

function nextTextVersion(block: InteractiveTextBlock) {
  setTextVersion(block, (block.activeContentIndex + 1) % block.content.length);
}

function addTextVersion(block: InteractiveTextBlock) {
  document.addTextContent(block.id, textMarkdown(block));
}

function removeTextVersion(block: InteractiveTextBlock) {
  document.removeTextContent(block.id, block.activeContentIndex);
}

function variableType(value: InteractiveValue) {
  if (value === null) return "空值";
  if (Array.isArray(value)) return "数组";
  if (typeof value === "string") return "文本";
  if (typeof value === "number") return "数字";
  if (typeof value === "boolean") return "布尔";
  return "对象";
}

function rendererName(rendererId: string) {
  return defaultInteractiveVariableRenderers.find(
    (renderer) => renderer.id === rendererId,
  )?.name ?? rendererId;
}

function blockRoleValue(block: InteractiveDocumentBlock) {
  return block.role ?? "default";
}

function updateBlockRole(
  block: InteractiveDocumentBlock,
  value: string,
) {
  block.role = value === "default"
    ? undefined
    : value as InteractiveBlockRole;
}

function usesJsonEditor(block: InteractiveVariableBlock) {
  return (
    block.rendererId === "json"
    || (
      block.rendererId !== "list"
      && block.rendererId !== "slider"
      && block.rendererId !== "toggle"
      && typeof block.value === "object"
      && block.value !== null
    )
  );
}

function variableDraft(block: InteractiveVariableBlock) {
  if (!(block.id in variableDrafts)) {
    variableDrafts[block.id] = block.rendererId === "list" && Array.isArray(block.value)
      ? block.value.map((item) => String(item ?? "")).join("\n")
      : JSON.stringify(block.value, null, 2) ?? "";
  }
  return variableDrafts[block.id] ?? "";
}

function resetVariableDraft(block: InteractiveVariableBlock) {
  delete variableDrafts[block.id];
  delete variableErrors[block.id];
  variableDraft(block);
}

function updateVariableJson(block: InteractiveVariableBlock, source: string) {
  variableDrafts[block.id] = source;
  try {
    block.value = JSON.parse(source) as InteractiveValue;
    variableErrors[block.id] = "";
  } catch {
    variableErrors[block.id] = "JSON 语法有误";
  }
}

function updateVariableList(block: InteractiveVariableBlock, source: string) {
  variableDrafts[block.id] = source;
  block.value = source.split(/\r?\n/).filter((item) => item.length > 0);
}

function updateVariableText(block: InteractiveVariableBlock, value: string) {
  block.value = value;
  resetVariableDraft(block);
}

function updateVariableNumber(block: InteractiveVariableBlock, value: unknown) {
  const numeric = Number(value);
  block.value = Number.isFinite(numeric) ? numeric : 0;
  resetVariableDraft(block);
}

function updateVariableRenderer(block: InteractiveVariableBlock, rendererId: string) {
  block.rendererId = rendererId;
  if (rendererId === "slider" && typeof block.value !== "number") block.value = 0;
  if (rendererId === "toggle" && typeof block.value !== "boolean") {
    block.value = Boolean(block.value);
  }
  if (rendererId === "list" && !Array.isArray(block.value)) {
    block.value = block.value == null || block.value === "" ? [] : [block.value];
  }
  resetVariableDraft(block);
}

function componentPropsDraft(block: InteractiveComponentBlock) {
  if (!(block.id in componentPropsDrafts)) {
    componentPropsDrafts[block.id] = JSON.stringify(block.props, null, 2);
  }
  return componentPropsDrafts[block.id] ?? "{}";
}

function updateComponentProps(block: InteractiveComponentBlock, source: string) {
  componentPropsDrafts[block.id] = source;
  try {
    const value = JSON.parse(source) as unknown;
    if (!value || Array.isArray(value) || typeof value !== "object") {
      throw new Error();
    }
    block.props = value as Record<string, InteractiveValue>;
    componentPropsErrors[block.id] = "";
  } catch {
    componentPropsErrors[block.id] = "组件参数必须是 JSON 对象";
  }
}

function cloneDocumentData(value: InteractiveDocumentData) {
  return JSON.parse(JSON.stringify(value)) as InteractiveDocumentData;
}
</script>

<template>
  <div
    data-testid="interactive-document-workspace"
    class="min-h-0 flex-1 overflow-y-auto bg-background [scrollbar-gutter:stable]"
  >
    <div class="mx-auto w-full max-w-[880px] px-6 pb-24 pt-10 mobile:px-3 mobile:pb-14 mobile:pt-5">
      <header class="mb-10 flex items-start gap-4 mobile:mb-6">
        <div class="min-w-0 flex-1">
          <input
            v-model="documentData.name"
            class="block w-full bg-transparent p-0 text-3xl font-semibold leading-tight outline-none mobile:text-2xl"
            aria-label="文档名称"
          />
          <input
            v-model="documentData.description"
            class="mt-2 block w-full bg-transparent p-0 text-sm leading-6 text-muted-foreground outline-none"
            aria-label="文档描述"
            placeholder=""
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="icon" variant="ghost" title="新增块">
              <Plus class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-40">
            <DropdownMenuItem @click="addBlock('text')">
              <FileText class="mr-2 size-4" />
              Markdown
            </DropdownMenuItem>
            <DropdownMenuItem @click="addBlock('variable')">
              <Braces class="mr-2 size-4" />
              变量
            </DropdownMenuItem>
            <DropdownMenuItem @click="addBlock('component')">
              <Box class="mr-2 size-4" />
              组件引用
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div class="space-y-7">
        <template v-for="row in documentRows" :key="row.id">
          <div
            v-if="row.kind === 'variables'"
            class="grid grid-cols-[repeat(auto-fit,minmax(min(15rem,100%),1fr))] gap-2.5"
          >
            <article
              v-for="block in row.blocks"
              :key="block.id"
              class="group min-w-0 rounded-md border bg-muted/10 px-3 py-2.5 transition-colors hover:bg-muted/20"
              :class="block.hidden && 'opacity-55'"
            >
              <div class="flex min-w-0 items-center gap-1.5">
                <Braces class="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  v-model="block.name"
                  class="h-6 min-w-0 flex-1 bg-transparent p-0 text-sm font-semibold outline-none"
                  aria-label="变量名"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger as-child>
                    <Button
                      size="icon"
                      variant="ghost"
                      class="mobile-touch-actions size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      title="变量菜单"
                    >
                      <MoreHorizontal class="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" class="w-40">
                    <DropdownMenuItem @click="editingDescriptionId = editingDescriptionId === block.id ? '' : block.id">
                      {{ editingDescriptionId === block.id ? "收起描述" : "编辑描述" }}
                    </DropdownMenuItem>
                    <DropdownMenuItem @click="document.setBlockHidden(block.id, !block.hidden)">
                      {{ block.hidden ? "参与编译" : "从编译中隐藏" }}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      class="text-destructive focus:text-destructive"
                      @click="deleteBlock(block.id)"
                    >
                      <Trash2 class="mr-2 size-4" />
                      删除变量
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                <span class="max-w-24 truncate font-mono" :title="block.id">{{ block.id }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ variableType(block.value) }}</span>
                <span aria-hidden="true">·</span>
                <Select
                  :model-value="blockRoleValue(block)"
                  @update:model-value="updateBlockRole(block, String($event))"
                >
                  <SelectTrigger
                    class="h-6 max-w-24 gap-1 border-0 bg-transparent px-0 py-0 font-mono text-[11px] shadow-none focus:ring-0"
                    title="消息角色"
                  >
                    <SelectValue class="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="role in roleOptions"
                      :key="role.value"
                      :value="role.value"
                    >
                      {{ role.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <span aria-hidden="true">·</span>
                <Select
                  :model-value="block.rendererId"
                  @update:model-value="updateVariableRenderer(block, String($event))"
                >
                  <SelectTrigger
                    class="h-6 max-w-24 gap-1 border-0 bg-transparent px-0 py-0 text-[11px] shadow-none focus:ring-0"
                    :title="rendererName(block.rendererId)"
                  >
                    <SelectValue class="truncate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="renderer in defaultInteractiveVariableRenderers"
                      :key="renderer.id"
                      :value="renderer.id"
                    >
                      {{ renderer.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <input
                v-if="editingDescriptionId === block.id"
                v-model="block.description"
                class="mt-2 h-7 w-full border-b bg-transparent text-xs outline-none"
                placeholder="变量描述"
              />

              <div class="mt-2 min-w-0">
                <div
                  v-if="block.rendererId === 'slider'"
                  class="flex h-9 items-center gap-3"
                >
                  <Slider
                    :model-value="[typeof block.value === 'number' ? block.value : 0]"
                    :min="0"
                    :max="100"
                    :step="1"
                    class="min-w-0 flex-1"
                    @update:model-value="updateVariableNumber(block, $event?.[0] ?? 0)"
                  />
                  <input
                    :value="block.value"
                    type="number"
                    class="h-7 w-14 bg-transparent text-right text-xs tabular-nums outline-none"
                    @input="updateVariableNumber(block, ($event.target as HTMLInputElement).value)"
                  />
                </div>

                <div
                  v-else-if="block.rendererId === 'toggle' || (block.rendererId === 'auto' && typeof block.value === 'boolean')"
                  class="flex h-9 items-center justify-between"
                >
                  <span class="text-xs text-muted-foreground">
                    {{ block.value ? "开启" : "关闭" }}
                  </span>
                  <Switch
                    size="sm"
                    :model-value="Boolean(block.value)"
                    @update:model-value="block.value = Boolean($event)"
                  />
                </div>

                <textarea
                  v-else-if="block.rendererId === 'list' && Array.isArray(block.value)"
                  :value="variableDraft(block)"
                  rows="3"
                  class="block max-h-28 min-h-16 w-full resize-y bg-transparent py-1 text-xs leading-5 outline-none"
                  placeholder="每行一项"
                  @input="updateVariableList(block, ($event.target as HTMLTextAreaElement).value)"
                />

                <div
                  v-else-if="usesJsonEditor(block)"
                  class="h-28 min-h-0 overflow-hidden border-t"
                >
                  <JavaScriptCodeMirrorEditor
                    :model-value="variableDraft(block)"
                    language="json"
                    frameless
                    @update:model-value="updateVariableJson(block, $event)"
                  />
                </div>

                <input
                  v-else-if="typeof block.value === 'number'"
                  :value="block.value"
                  type="number"
                  class="h-9 w-full border-b bg-transparent text-sm outline-none"
                  @input="updateVariableNumber(block, ($event.target as HTMLInputElement).value)"
                />

                <input
                  v-else
                  :value="block.value == null ? '' : String(block.value)"
                  class="h-9 w-full border-b bg-transparent text-sm outline-none"
                  placeholder="变量值"
                  @input="updateVariableText(block, ($event.target as HTMLInputElement).value)"
                />

                <p v-if="variableErrors[block.id]" class="mt-1 text-[11px] text-destructive">
                  {{ variableErrors[block.id] }}
                </p>
              </div>
            </article>
          </div>

          <section
            v-else-if="row.block.type === 'text'"
            class="transition-opacity"
            :class="row.block.hidden && 'opacity-55'"
          >
            <header
              class="group flex min-h-10 cursor-pointer items-center gap-2"
              @click="toggleCollapsed(row.block.id)"
            >
              <ChevronRight
                v-if="isCollapsed(row.block.id)"
                class="size-4 shrink-0 text-muted-foreground"
              />
              <ChevronDown v-else class="size-4 shrink-0 text-muted-foreground" />
              <input
                v-model="row.block.name"
                class="h-8 min-w-0 flex-1 bg-transparent p-0 text-base font-semibold outline-none"
                aria-label="文本块标题"
                @click.stop
              />
              <Select
                :model-value="blockRoleValue(row.block)"
                @update:model-value="updateBlockRole(row.block, String($event))"
              >
                <SelectTrigger
                  class="h-8 w-28 border-0 bg-transparent px-1 font-mono text-xs shadow-none focus:ring-0"
                  title="消息角色"
                  @click.stop
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="role in roleOptions"
                    :key="role.value"
                    :value="role.value"
                  >
                    {{ role.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Switch
                size="sm"
                :model-value="!row.block.hidden"
                aria-label="参与编译"
                @click.stop
                @update:model-value="document.setBlockHidden(row.block.id, !Boolean($event))"
              />
              <div class="flex h-8 items-center rounded-md bg-muted/45" @click.stop>
                <Button
                  size="icon"
                  variant="ghost"
                  class="size-7"
                  title="上一页"
                  :disabled="row.block.content.length <= 1"
                  @click="previousTextVersion(row.block)"
                >
                  <ChevronLeft class="size-3.5" />
                </Button>
                <span class="min-w-12 px-1 text-center text-xs tabular-nums text-muted-foreground">
                  {{ row.block.activeContentIndex + 1 }} / {{ row.block.content.length }}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  class="size-7"
                  title="下一页"
                  :disabled="row.block.content.length <= 1"
                  @click="nextTextVersion(row.block)"
                >
                  <ChevronRight class="size-3.5" />
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button
                    size="icon"
                    variant="ghost"
                    class="size-8"
                    title="文本块菜单"
                    @click.stop
                  >
                    <MoreHorizontal class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-44">
                  <DropdownMenuItem @click="addTextVersion(row.block)">
                    <Plus class="mr-2 size-4" />
                    新建页面
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="removeTextVersion(row.block)">
                    <Trash2 class="mr-2 size-4" />
                    删除当前页
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="editingDescriptionId = editingDescriptionId === row.block.id ? '' : row.block.id">
                    {{ editingDescriptionId === row.block.id ? "收起描述" : "编辑描述" }}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    :disabled="documentData.blocks[0]?.id === row.block.id"
                    @click="moveBlock(row.block.id, -1)"
                  >
                    <ChevronUp class="mr-2 size-4" />
                    上移
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    :disabled="documentData.blocks[documentData.blocks.length - 1]?.id === row.block.id"
                    @click="moveBlock(row.block.id, 1)"
                  >
                    <ChevronDown class="mr-2 size-4" />
                    下移
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    class="text-destructive focus:text-destructive"
                    @click="deleteBlock(row.block.id)"
                  >
                    <Trash2 class="mr-2 size-4" />
                    删除整块
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            <input
              v-if="editingDescriptionId === row.block.id"
              v-model="row.block.description"
              class="mb-2 ml-6 h-8 w-[calc(100%_-_1.5rem)] border-b bg-transparent text-xs text-muted-foreground outline-none"
              placeholder="文本块描述"
            />

            <div
              v-show="!isCollapsed(row.block.id)"
              class="interactive-doc-reading-card rounded-lg border bg-card/35 px-8 py-5 mobile:px-3 mobile:py-3"
            >
              <ConversationComposerEditor
                :model-value="textMarkdown(row.block)"
                placeholder="输入 Markdown，可使用 {{variable}} 宏"
                enable-block-edit
                :enable-ai="false"
                @update:model-value="updateTextMarkdown(row.block, $event)"
              />
            </div>
          </section>

          <section
            v-else
            class="transition-opacity"
            :class="row.block.hidden && 'opacity-55'"
          >
            <header
              class="group flex min-h-10 cursor-pointer items-center gap-2"
              @click="toggleCollapsed(row.block.id)"
            >
              <ChevronRight
                v-if="isCollapsed(row.block.id)"
                class="size-4 text-muted-foreground"
              />
              <ChevronDown v-else class="size-4 text-muted-foreground" />
              <Box class="size-4 text-muted-foreground" />
              <input
                v-model="row.block.name"
                class="h-8 min-w-0 flex-1 bg-transparent text-base font-semibold outline-none"
                aria-label="组件块标题"
                @click.stop
              />
              <span class="max-w-48 truncate font-mono text-xs text-muted-foreground">
                {{ row.block.componentId || "未指定组件" }}
              </span>
              <Select
                :model-value="blockRoleValue(row.block)"
                @update:model-value="updateBlockRole(row.block, String($event))"
              >
                <SelectTrigger
                  class="h-8 w-28 border-0 bg-transparent px-1 font-mono text-xs shadow-none focus:ring-0"
                  title="消息角色"
                  @click.stop
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="role in roleOptions"
                    :key="role.value"
                    :value="role.value"
                  >
                    {{ role.label }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger as-child>
                  <Button size="icon" variant="ghost" class="size-8" title="组件菜单" @click.stop>
                    <MoreHorizontal class="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" class="w-40">
                  <DropdownMenuItem @click="document.setBlockHidden(row.block.id, !row.block.hidden)">
                    {{ row.block.hidden ? "参与编译" : "从编译中隐藏" }}
                  </DropdownMenuItem>
                  <DropdownMenuItem @click="editingDescriptionId = editingDescriptionId === row.block.id ? '' : row.block.id">
                    编辑描述
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    class="text-destructive focus:text-destructive"
                    @click="deleteBlock(row.block.id)"
                  >
                    <Trash2 class="mr-2 size-4" />
                    删除组件
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </header>

            <div v-show="!isCollapsed(row.block.id)" class="rounded-lg border bg-card/35 px-5 py-4">
              <input
                v-model="row.block.componentId"
                class="h-8 w-full border-b bg-transparent font-mono text-xs outline-none"
                placeholder="external/component-id"
              />
              <input
                v-if="editingDescriptionId === row.block.id"
                v-model="row.block.description"
                class="mt-2 h-8 w-full border-b bg-transparent text-xs outline-none"
                placeholder="组件描述"
              />
              <div class="mt-3 h-28 overflow-hidden border-t">
                <JavaScriptCodeMirrorEditor
                  :model-value="componentPropsDraft(row.block)"
                  language="json"
                  frameless
                  @update:model-value="updateComponentProps(row.block, $event)"
                />
              </div>
              <p v-if="componentPropsErrors[row.block.id]" class="mt-1 text-xs text-destructive">
                {{ componentPropsErrors[row.block.id] }}
              </p>
              <div class="interactive-doc-component-fallback mt-3 border-t pt-3">
                <ConversationComposerEditor
                  :model-value="row.block.fallbackMarkdown"
                  placeholder="组件不可用时显示的 Markdown"
                  :enable-ai="false"
                  @update:model-value="row.block.fallbackMarkdown = $event"
                />
              </div>
            </div>
          </section>
        </template>

        <div
          v-if="documentData.blocks.length === 0"
          class="py-24 text-center text-sm text-muted-foreground"
        >
          文档还是空的。使用右上角按钮添加第一个 Markdown 或变量。
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.interactive-doc-reading-card :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: 9rem !important;
  max-height: none !important;
}

.interactive-doc-reading-card :where(.milkdown, .editor) {
  overflow: visible !important;
}

.interactive-doc-component-fallback :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: 6rem !important;
  max-height: none !important;
}

.mobile-layout .interactive-doc-reading-card :where(.conversation-composer-editor, .milkdown, .editor, .ProseMirror) {
  min-height: 7rem !important;
}
</style>
