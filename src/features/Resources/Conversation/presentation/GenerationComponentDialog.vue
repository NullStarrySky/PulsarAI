<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { X } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  registerGenerationComponentRequester,
  type GenerationComponentRequest,
} from "@/features/Resources/Conversation/application/conversation-generation";
import { getGenerationComponent } from "./generation-component-registry";

const open = ref(false);
const request = ref<GenerationComponentRequest | null>(null);
let resolveRequest: ((value: unknown) => void) | null = null;
let unregisterRequester: (() => void) | null = null;

const activeComponent = computed(() =>
  request.value
    ? getGenerationComponent(request.value.componentId)
    : null,
);

onMounted(() => {
  unregisterRequester = registerGenerationComponentRequester((nextRequest) => {
    settle(undefined);
    request.value = nextRequest;
    open.value = true;
    return new Promise((resolve) => {
      resolveRequest = resolve;
    });
  });
});

onBeforeUnmount(() => {
  unregisterRequester?.();
  settle(undefined);
});

function settle(value: unknown) {
  resolveRequest?.(value);
  resolveRequest = null;
  open.value = false;
  request.value = null;
}

function onOpenChange(value: boolean) {
  if (!value) {
    settle(undefined);
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      :show-close-button="false"
      class="w-[min(680px,calc(100vw-32px))] max-w-none gap-5 sm:max-w-none"
    >
      <DialogHeader class="pr-10">
        <DialogTitle>{{ request?.title || "需要你的输入" }}</DialogTitle>
        <DialogDescription v-if="request?.description">
          {{ request.description }}
        </DialogDescription>
      </DialogHeader>

      <Button
        size="icon"
        variant="ghost"
        class="absolute right-4 top-4 size-8"
        title="关闭"
        @click="settle(undefined)"
      >
        <X class="size-4" />
      </Button>

      <component
        :is="activeComponent"
        v-if="activeComponent && request"
        v-bind="request.props"
        @resolve="settle"
        @cancel="settle(undefined)"
      />

      <div
        v-else-if="request"
        class="grid min-h-28 place-items-center border-y py-8 text-center text-sm text-muted-foreground"
      >
        未注册组件 {{ request.componentId }}
      </div>

      <DialogFooter v-if="!activeComponent">
        <Button variant="ghost" @click="settle(undefined)">取消</Button>
        <Button @click="settle(true)">继续</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
