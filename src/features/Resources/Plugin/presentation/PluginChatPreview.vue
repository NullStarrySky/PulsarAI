<script setup lang="ts">
import { computed, ref, defineComponent, h, PropType } from "vue";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Layers,
  AlertCircle,
  MessageSquare,
  Sparkles,
  Workflow,
} from "lucide-vue-next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { executeSandboxCode } from "@/features/Sandbox/domain/sandbox";
import { parsePluginChatContext } from "@/features/Resources/Plugin/domain/plugin-chat";

const props = defineProps<{
  modelValue: string;
  resolver: any;
  fileId: string;
}>();

// Helper to parse content into text and macro segments
interface ContentSegment {
  type: "text" | "macro";
  text: string;
}

function parseContentSegments(content: string): ContentSegment[] {
  if (!content) return [];
  const segments: ContentSegment[] = [];
  const regex = /(\{\{[\s\S]*?\}\}|\[\[[\s\S]*?\]\])/g;
  const parts = content.split(regex);
  for (const part of parts) {
    if (!part) continue;
    if (
      (part.startsWith("{{") && part.endsWith("}}")) ||
      (part.startsWith("[[") && part.endsWith("]]"))
    ) {
      segments.push({ type: "macro", text: part });
    } else {
      segments.push({ type: "text", text: part });
    }
  }
  return segments;
}

// Check object types
function isResourceValue(val: any): boolean {
  return (
    val &&
    typeof val === "object" &&
    typeof val.id === "string" &&
    typeof val.name === "string" &&
    typeof val.path === "string" &&
    typeof val.toString === "function"
  );
}

function isContainerValue(val: any): boolean {
  return (
    val &&
    typeof val === "object" &&
    typeof val.name === "string" &&
    typeof val.scope === "string" &&
    typeof val.list === "function" &&
    typeof val.toString === "function"
  );
}

// 1. Recursive Segment List Component
const MacroSegmentList: any = defineComponent({
  name: "MacroSegmentList",
  props: {
    content: { type: String, required: true },
    resolver: { type: Object as PropType<any>, required: true },
    fileId: { type: String, required: true },
  },
  setup(segmentProps) {
    const segments = computed(() => parseContentSegments(segmentProps.content));
    return () =>
      h(
        "div",
        { class: "space-y-2.5" },
        segments.value.map((segment: ContentSegment, idx: number) => {
          if (segment.type === "text") {
            return h(
              "div",
              { class: "text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed py-0.5" },
              segment.text,
            );
          } else {
            return h(MacroBlock, {
              key: idx,
              macro: segment.text,
              resolver: segmentProps.resolver,
              fileId: segmentProps.fileId,
            });
          }
        }),
      );
  },
});

// 2. Interactive Macro Block Component
const MacroBlock: any = defineComponent({
  name: "MacroBlock",
  props: {
    macro: { type: String, required: true },
    resolver: { type: Object as PropType<any>, required: true },
    fileId: { type: String, required: true },
  },
  setup(blockProps) {
    const expanded = ref(false);

    // Evaluate macro safely
    const resolvedResult = computed(() => {
      if (!expanded.value) return null;

      let expr = blockProps.macro.trim();
      if (expr.startsWith("{{") && expr.endsWith("}}")) {
        expr = expr.slice(2, -2).trim();
      } else if (expr.startsWith("[[") && expr.endsWith("]]")) {
        expr = expr.slice(2, -2).trim();
      }

      const env = {
        ...(blockProps.resolver?.environment ?? {}),
        imports: blockProps.resolver?.importsForResource(blockProps.fileId),
      };

      try {
        const value = executeSandboxCode(expr, [env]);
        return { ok: true, value, error: "" };
      } catch (err) {
        return {
          ok: false,
          value: null,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    });

    return () => {
      const header = h(
        "button",
        {
          type: "button",
          onClick: () => {
            expanded.value = !expanded.value;
          },
          class:
            "flex w-full items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-left font-mono text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all duration-200 shadow-xs",
        },
        [
          h(expanded.value ? ChevronDown : ChevronRight, { class: "size-3.5 shrink-0" }),
          h(Sparkles, { class: "size-3.5 shrink-0 text-primary/60" }),
          h("span", { class: "truncate flex-1" }, blockProps.macro),
        ],
      );

      const content = expanded.value
        ? h(
            "div",
            { class: "mt-1.5 ml-4 rounded-xl border border-border/50 bg-muted/10 p-3.5 animate-in slide-in-from-top-1 duration-200" },
            [h(MacroValueRenderer, {
              result: resolvedResult.value,
              resolver: blockProps.resolver,
              fileId: blockProps.fileId,
            })],
          )
        : null;

      return h("div", { class: "my-1" }, [header, content]);
    };
  },
});

// 3. Macro Value Renderer Component (Handles Resources, Containers, Arrays, and Primitives)
const MacroValueRenderer: any = defineComponent({
  name: "MacroValueRenderer",
  props: {
    result: { type: Object as PropType<any> },
    resolver: { type: Object as PropType<any>, required: true },
    fileId: { type: String, required: true },
  },
  setup(rendererProps) {
    return () => {
      const res = rendererProps.result;
      if (!res) return null;
      if (!res.ok) {
        return h(
          "div",
          { class: "flex items-start gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/25 p-3 rounded-lg" },
          [
            h(AlertCircle, { class: "size-4 shrink-0 mt-0.5" }),
            h("span", { class: "font-mono" }, `求值失败：${res.error}`),
          ],
        );
      }

      const val = res.value;

      // 1. Null / Undefined
      if (val === null || val === undefined) {
        return h(
          "div",
          { class: "text-xs font-mono text-muted-foreground italic" },
          val === null ? "null" : "undefined",
        );
      }

      // 2. Resource Value
      if (isResourceValue(val)) {
        return h("div", { class: "space-y-3" }, [
          h(
            "div",
            { class: "flex items-center gap-2 bg-card border px-3 py-2 rounded-lg text-xs shadow-xs" },
            [
              h(FileText, { class: "size-4 text-primary" }),
              h("div", { class: "min-w-0 flex-1" }, [
                h("div", { class: "font-semibold truncate text-foreground/90" }, val.name),
                h("div", { class: "text-[10px] text-muted-foreground truncate" }, val.path),
              ]),
            ],
          ),
          h(
            "div",
            { class: "border-l-2 border-primary/20 pl-3.5 py-0.5" },
            [h(MacroSegmentList, {
              content: val.toString(),
              resolver: rendererProps.resolver,
              fileId: val.id, // Switch context fileId to the imported resource!
            })],
          ),
        ]);
      }

      // 3. Container Value
      if (isContainerValue(val)) {
        const listResult = val.list();
        const resources = listResult?.resources ?? [];
        return h("div", { class: "space-y-2.5" }, [
          h(
            "div",
            { class: "flex items-center justify-between border-b pb-1.5" },
            [
              h("span", { class: "text-xs font-bold flex items-center gap-1.5" }, [
                h(Layers, { class: "size-3.5 text-primary" }),
                val.name,
              ]),
              h(
                "span",
                { class: "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500" },
                val.scope,
              ),
            ],
          ),
          resources.length === 0
            ? h("div", { class: "text-xs text-muted-foreground italic" }, "空容器")
            : h(
                "div",
                { class: "space-y-1.5" },
                resources.map((path: string) => {
                  let resourceVal: any = null;
                  let errStr = "";
                  try {
                    resourceVal = val.get(path);
                  } catch (e) {
                    errStr = e instanceof Error ? e.message : String(e);
                  }

                  return h(
                    "div",
                    { key: path, class: "rounded-lg border bg-card p-2.5 text-xs shadow-xs" },
                    [
                      h("div", { class: "font-mono font-semibold text-foreground/80 mb-1" }, path),
                      errStr
                        ? h("div", { class: "text-destructive text-[10px]" }, errStr)
                        : h(MacroSegmentList, {
                            content: resourceVal.toString(),
                            resolver: rendererProps.resolver,
                            fileId: resourceVal.id,
                          }),
                    ],
                  );
                }),
              ),
        ]);
      }

      // 4. Arrays
      if (Array.isArray(val)) {
        if (val.length === 0) {
          return h("div", { class: "text-xs text-muted-foreground italic font-mono" }, "[] (空数组)");
        }

        // Check if it's an array of chat messages
        const isChatArray = val.every((item: any) => item && typeof item === "object" && typeof item.role === "string" && typeof item.content === "string");

        if (isChatArray) {
          return h(
            "div",
            { class: "space-y-4" },
            val.map((msg: any, idx: number) =>
              h(
                "div",
                { key: idx, class: "rounded-xl border bg-card p-3 shadow-xs" },
                [
                  h("div", { class: "flex items-center gap-1.5 border-b pb-2 mb-2" }, [
                    h(MessageSquare, { class: "size-3.5 text-primary" }),
                    h("span", { class: "text-[10px] font-bold uppercase tracking-wider text-muted-foreground" }, msg.role),
                  ]),
                  h(MacroSegmentList, {
                    content: msg.content,
                    resolver: rendererProps.resolver,
                    fileId: rendererProps.fileId,
                  }),
                ],
              ),
            ),
          );
        }

        return h(
          "div",
          { class: "space-y-2" },
          val.map((item: any, idx: number) =>
            h(
              "div",
              { key: idx, class: "border-b border-border/40 pb-2 last:border-0" },
              [h(MacroValueRenderer, {
                result: { ok: true, value: item, error: "" },
                resolver: rendererProps.resolver,
                fileId: rendererProps.fileId,
              })],
            ),
          ),
        );
      }

      // 5. Objects (General)
      if (typeof val === "object") {
        return h(
          "pre",
          { class: "text-xs font-mono bg-muted/30 p-2.5 rounded-lg overflow-x-auto text-foreground/80 leading-relaxed max-w-full" },
          JSON.stringify(val, null, 2),
        );
      }

      // 6. Primitives (String, Number, Boolean)
      return h(
        "div",
        { class: "text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed py-0.5" },
        String(val),
      );
    };
  },
});

const parsed = computed(() => {
  try {
    return { value: parsePluginChatContext(props.modelValue), error: "" };
  } catch (error) {
    return {
      value: { message: [] as Array<{ role: "system" | "user" | "assistant"; content: string }> },
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <div class="flex items-center justify-between border-b px-5 py-4 bg-muted/10">
      <div>
        <div class="text-sm font-semibold tracking-tight text-foreground/90 flex items-center gap-2">
          <Workflow class="size-4 text-primary animate-pulse" />
          <span>对话上下文只读预览</span>
        </div>
        <p class="mt-0.5 text-xs text-muted-foreground">宏已按单行解析展示，点击可展开递归解析链路。</p>
      </div>
    </div>

    <div v-if="parsed.error" class="m-5 rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-2">
      <AlertCircle class="size-4 shrink-0 mt-0.5" />
      <span>{{ parsed.error }}；请切换到源码修复。</span>
    </div>

    <ScrollArea v-else class="min-h-0 flex-1">
      <div class="space-y-4 p-5">
        <div
          v-for="(message, index) in parsed.value.message"
          :key="index"
          class="rounded-xl border border-border/50 bg-card shadow-xs hover:border-border/80 transition-all duration-200 p-4"
        >
          <div class="flex items-center gap-2 border-b border-border/40 pb-2.5 mb-3.5">
            <span
              class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
              :class="[
                message.role === 'system' && 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
                message.role === 'user' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                message.role === 'assistant' && 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
              ]"
            >
              {{ message.role }}
            </span>
            <span class="text-[10px] font-mono font-semibold text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded">#{{ index + 1 }}</span>
          </div>

          <div class="min-w-0 flex-1">
            <MacroSegmentList
              :content="message.content"
              :resolver="props.resolver"
              :file-id="props.fileId"
            />
          </div>
        </div>

        <div
          v-if="!parsed.value.message.length"
          class="flex min-h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 text-xs text-muted-foreground p-6"
        >
          <MessageSquare class="mb-1.5 size-5 text-muted-foreground/80" />
          <span>暂无消息</span>
        </div>
      </div>
    </ScrollArea>
  </div>
</template>
