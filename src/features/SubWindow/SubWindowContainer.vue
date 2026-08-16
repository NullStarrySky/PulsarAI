<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type Component } from "vue";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  readSubWindowParamsFromLocation,
  type SubWindowBridgeMessage,
  type SubWindowParams,
} from "./sub-window-protocol";
import { listenBridgeMessages, sendBridgeMessage } from "./sub-window-service";

const props = withDefaults(
  defineProps<{
    component: Component;
    params?: Record<string, unknown>;
    windowParams?: SubWindowParams | null;
    loadMode?: "immediate" | "on-visible";
  }>(),
  {
    params: () => ({}),
    windowParams: null,
    loadMode: "immediate",
  },
);

const emit = defineEmits<{ message: [message: SubWindowBridgeMessage] }>();
const currentParams = ref<SubWindowParams | null>(props.windowParams ?? readSubWindowParamsFromLocation());
const visible = ref(props.loadMode === "immediate");
let unlistenParams: UnlistenFn | null = null;
let unlistenBridge: UnlistenFn | null = null;

const shouldRender = computed(() => visible.value || props.loadMode === "immediate");

watch(
  () => props.windowParams,
  (params) => {
    if (params) {
      currentParams.value = params;
    }
  },
);

onMounted(async () => {
  try {
    unlistenParams = await getCurrentWebviewWindow().listen<SubWindowParams>("subwindow:params", (event) => {
      currentParams.value = event.payload;
      visible.value = true;
    });
  } catch {
    // Browser preview cannot access Tauri window APIs.
  }
  unlistenBridge = await listenBridgeMessages((message) => emit("message", message));
});

onUnmounted(() => {
  unlistenParams?.();
  unlistenBridge?.();
});

async function send(channel: string, payload: unknown) {
  await sendBridgeMessage({
    channel,
    payload,
    sourceLabel: currentParams.value?.label ?? "main",
  });
}

defineExpose({ currentParams, send });
</script>

<template>
  <component
    :is="component"
    v-if="shouldRender"
    v-bind="params"
    :sub-window-params="currentParams"
    @subwindow-message="send('component', $event)"
  />
</template>
