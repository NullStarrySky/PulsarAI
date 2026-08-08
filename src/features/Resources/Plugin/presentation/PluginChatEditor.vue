<script setup lang="ts">
import { computed } from "vue";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parsePluginChatContext } from "@/features/Resources/Plugin/domain/plugin-chat";

const props = defineProps<{ modelValue: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

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

function update(index: number, patch: Partial<{ role: "system" | "user" | "assistant"; content: string }>) {
  const message = structuredClone(parsed.value.value.message);
  message[index] = { ...message[index]!, ...patch };
  emit("update:modelValue", JSON.stringify({ message }, null, 2));
}

function add() {
  emit("update:modelValue", JSON.stringify({
    message: [...parsed.value.value.message, { role: "system", content: "" }],
  }, null, 2));
}

function remove(index: number) {
  const message = parsed.value.value.message.filter((_, itemIndex) => itemIndex !== index);
  emit("update:modelValue", JSON.stringify({ message }, null, 2));
}

function move(index: number, delta: number) {
  const target = index + delta;
  const message = structuredClone(parsed.value.value.message);
  if (target < 0 || target >= message.length) return;
  [message[index], message[target]] = [message[target]!, message[index]!];
  emit("update:modelValue", JSON.stringify({ message }, null, 2));
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col bg-background/5">
    <div class="flex items-center justify-between border-b px-5 py-4 bg-muted/10">
      <div>
        <div class="text-sm font-semibold tracking-tight text-foreground/90">对话上下文</div>
        <p class="mt-0.5 text-xs text-muted-foreground">按顺序编辑带角色消息；content 支持 imports、{{ }} 与 [[ ]]。</p>
      </div>
      <Button size="sm" variant="outline" class="h-8 rounded-lg shadow-sm hover:bg-muted" @click="add">
        <Plus class="mr-1 size-3.5" />
        添加消息
      </Button>
    </div>

    <div v-if="parsed.error" class="m-5 rounded-lg border border-destructive/35 bg-destructive/10 p-4 text-xs text-destructive">
      {{ parsed.error }}；请切换到源码修复。
    </div>

    <ScrollArea v-else class="min-h-0 flex-1">
      <div class="space-y-4 p-5">
        <div
          v-for="(message, index) in parsed.value.message"
          :key="index"
          class="rounded-xl border border-border/60 bg-card shadow-sm hover:border-border/85 transition-all duration-200"
        >
          <div class="flex items-center gap-2 border-b border-border/40 px-3.5 py-2.5 bg-muted/5">
            <Select :model-value="message.role" @update:model-value="update(index, { role: $event as never })">
              <SelectTrigger class="h-8 w-32 text-xs rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent class="rounded-xl">
                <SelectItem value="system">system</SelectItem>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="assistant">assistant</SelectItem>
              </SelectContent>
            </Select>
            <span class="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1.5 py-0.5 bg-muted/40 rounded">#{{ index + 1 }}</span>
            <div class="ml-auto flex items-center gap-0.5">
              <Button size="icon" variant="ghost" class="size-7 rounded-lg" :disabled="index === 0" @click="move(index, -1)">
                <ArrowUp class="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" class="size-7 rounded-lg" :disabled="index === parsed.value.message.length - 1" @click="move(index, 1)">
                <ArrowDown class="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" class="size-7 rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10" @click="remove(index)">
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
          <textarea
            :value="message.content"
            class="min-h-32 w-full resize-y rounded-b-xl border-t border-border/40 bg-muted/15 p-3.5 font-mono text-xs leading-5 outline-none transition-colors focus:bg-background"
            placeholder="输入消息内容..."
            @input="update(index, { content: ($event.target as HTMLTextAreaElement).value })"
          />
        </div>

        <button
          v-if="!parsed.value.message.length"
          type="button"
          class="flex min-h-40 w-full flex-col items-center justify-center rounded-xl border border-dashed border-border/80 bg-background/50 text-xs text-muted-foreground hover:border-primary/50 hover:bg-muted/10 hover:text-foreground transition-all duration-200"
          @click="add"
        >
          <Plus class="mb-1.5 size-5 text-muted-foreground/80" />
          <span>添加第一条消息</span>
        </button>
      </div>
    </ScrollArea>
  </div>
</template>
