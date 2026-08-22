<script setup lang="ts">
import { computed, ref, toRef, type Component } from "vue";
import { Paperclip, Send } from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import ModelSelect from "@/features/ModelConnection/components/ModelSelect.vue";
import { usePackageStore } from "@/features/Package/package-store";
import type { PluginConfig } from "@/features/Plugin/editors/config/plugin-config";
import { compilePluginVueFile } from "@/features/Plugin/editors/vue/plugin-vue-runtime";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { findPluginNodeByPath, type ResolvedPluginAction } from "@/features/Plugin/tree/plugin-types";
import { fileToMessagePart } from "@/features/Conversation/messages/message-attachment";
import type { ActionPart, FilePart } from "@/features/Conversation/messages/conversation-types";
import { useConversation } from "@/features/Conversation/use-conversation";
import ConversationComposerEditor from "./ConversationComposerEditor.vue";
import ComposerAttachmentStrip from "./ComposerAttachmentStrip.vue";
import PromptBar from "./PromptBar.vue";

const props = defineProps<{ chatId: string }>();
const chat = useConversation(toRef(props, "chatId"));
const packages = usePackageStore();
const plugins = usePluginStore();
const files = ref<FilePart[]>([]);
const selectedAction = ref<ActionPart | null>(null);
const input = ref<HTMLInputElement | null>(null);
const fullscreenOpen = ref(false);
const whiteboardOpen = ref(false);
const actionViewOpen = ref(false);
const actionView = ref<ResolvedPluginAction | null>(null);
const actionViewComponent = ref<Component | null>(null);

const currentPackage = computed(() =>
  packages.packages.find((item) => item.id === chat.chat.value?.packageId) ?? null,
);
const mainPlugin = computed(() => {
  const id = currentPackage.value?.mainPluginId;
  return id ? plugins.plugins.find((item) => item.id === id) ?? null : null;
});
const modelConfig = computed(() => {
  const plugin = mainPlugin.value;
  const file = plugin ? findPluginNodeByPath(plugin, "config.json") : null;
  return file?.kind === "file" && file.content && typeof file.content === "object" ? file : null;
});
const selectedModel = computed(() => {
  const value = modelConfig.value
    ? (modelConfig.value.content as PluginConfig)["generation/model"]?.value
    : null;
  return typeof value === "string" ? value : "";
});
const isEmpty = computed(() => chat.activePath.value.length === 0);
const suggestions = ["用一句话介绍你自己", "我们开始一段新的对话", "帮我梳理一个想法"];
const actions = computed(() => plugins.actionResourcesForPackage(
  currentPackage.value?.id,
  currentPackage.value?.enabledGlobalPluginIds,
  currentPackage.value?.mainPluginId,
));

async function updateModel(value: string) {
  const plugin = mainPlugin.value;
  if (!plugin) return;
  const file = modelConfig.value;
  const config = file?.content as PluginConfig | undefined;
  if (file && config && !config["generation/model"]) {
    await plugins.updateNode(plugin.id, file.id, {
      content: {
        ...structuredClone(config),
        "generation/model": {
          renderer: {
            name: "ModelSelect",
            title: "模型",
            description: "留空时继承全局默认模型；引用可附带思考强度。",
          },
          value: value || null,
        },
      },
    });
    return;
  }
  await plugins.setConfigValue(plugin.id, "generation/model", value || null);
}

async function selectFiles(event: Event) {
  const target = event.target as HTMLInputElement;
  files.value.push(
    ...(await Promise.all(Array.from(target.files ?? []).map(fileToMessagePart))),
  );
  target.value = "";
}

async function send() {
  if (chat.generating.value) return;
  const parts = selectedAction.value ? [...files.value, selectedAction.value] : files.value;
  if (await chat.send(parts)) {
    files.value = [];
    selectedAction.value = null;
  }
}

function useSuggestion(value: string) {
  chat.draft.value = value;
}

function openActionView(action: ResolvedPluginAction) {
  const plugin = plugins.plugins.find((item) => item.id === action.pluginId);
  if (!plugin) {
    push.error("动作所属插件不可用。");
    return;
  }
  const result = compilePluginVueFile(plugin, action.resource);
  if (!result.component) {
    push.error(result.diagnostics[0] || "无法打开动作视图。");
    return;
  }
  if (result.diagnostics.length) push.warning(result.diagnostics.join("\n"));
  actionView.value = action;
  actionViewComponent.value = result.component;
  actionViewOpen.value = true;
}
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 bottom-0 z-20 grid grid-cols-[minmax(1rem,1fr)_minmax(0,724px)_minmax(1rem,1fr)] mobile:block">
    <div aria-hidden="true" class="mobile:hidden" />
    <div class="pointer-events-auto w-full pb-4 pt-2 mobile:px-2 mobile:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div v-if="isEmpty" class="mb-3 flex flex-wrap justify-center gap-2 px-2">
        <Button
          v-for="suggestion in suggestions"
          :key="suggestion"
          variant="secondary"
          class="h-8 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground"
          @click="useSuggestion(suggestion)"
        >
          {{ suggestion }}
        </Button>
      </div>

      <PromptBar
        v-model="chat.draft.value"
        :attachments="files"
        :actions="actions"
        :selected-action="selectedAction"
        :generating="chat.generating.value"
        @submit="send"
        @attach="input?.click()"
        @whiteboard="whiteboardOpen = true"
        @fullscreen="fullscreenOpen = true"
        @remove-attachment="files.splice($event, 1)"
        @update:selected-action="selectedAction = $event"
        @open-view="openActionView"
      >
        <template #model>
          <ModelSelect
            :model-value="selectedModel"
            button-class="h-8 max-w-[min(18rem,42vw)] justify-between rounded-lg border-0 bg-muted/65 px-2.5 text-xs shadow-none mobile:h-10"
            allow-empty
            empty-label="继承默认模型"
            @update:model-value="updateModel"
          />
        </template>
      </PromptBar>
      <input ref="input" class="hidden" type="file" multiple @change="selectFiles" />
    </div>
    <div aria-hidden="true" class="mobile:hidden" />
  </div>

  <Dialog v-model:open="fullscreenOpen">
    <DialogContent class="h-[min(46rem,calc(100dvh-2rem))] max-w-3xl overflow-hidden">
      <DialogHeader><DialogTitle>输入消息</DialogTitle></DialogHeader>
      <ComposerAttachmentStrip
        v-if="files.length"
        :attachments="files"
        @remove="files.splice($event, 1)"
      />
      <ConversationComposerEditor
        v-model="chat.draft.value"
        class="flex-1"
        placeholder="输入消息…"
        @submit="fullscreenOpen = false; send()"
      />
      <DialogFooter>
        <Button variant="ghost" size="icon" class="mr-auto" title="添加附件" @click="input?.click()"><Paperclip class="size-4" /></Button>
        <Button variant="outline" @click="fullscreenOpen = false">取消</Button>
        <Button :disabled="chat.generating.value || (!chat.draft.value.trim() && !files.length)" @click="fullscreenOpen = false; send()"><Send class="size-4" />发送</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="whiteboardOpen">
    <DialogContent class="h-[min(820px,92vh)] w-[min(1200px,calc(100vw-32px))] max-w-none overflow-hidden p-0 sm:max-w-none mobile:h-[100dvh] mobile:w-screen mobile:rounded-none mobile:border-0">
      <DialogHeader class="sr-only"><DialogTitle>白板</DialogTitle></DialogHeader>
      <iframe class="h-full w-full border-0 bg-background" src="https://excalidraw.com/" title="Excalidraw 白板" allow="clipboard-read; clipboard-write" />
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="actionViewOpen">
    <DialogContent class="max-h-[min(760px,90vh)] w-[min(760px,calc(100vw-32px))] max-w-none overflow-y-auto sm:max-w-none">
      <DialogHeader><DialogTitle>/{{ actionView?.resource.name }}</DialogTitle></DialogHeader>
      <component :is="actionViewComponent" v-if="actionViewComponent" />
    </DialogContent>
  </Dialog>
</template>
