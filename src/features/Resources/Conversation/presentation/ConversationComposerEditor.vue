<script setup lang="ts">
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/vue";
import { computed, defineComponent, h, ref, watch } from "vue";
import { conversationCrepeFeatureConfigs, conversationCrepeFeatures } from "./conversation-crepe";
import { useAppearanceStore } from "@/features/UI/theme/application/appearance-store";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    enableBlockEdit?: boolean;
    enableAi?: boolean;
    enableTopBar?: boolean;
    compact?: boolean;
    submitOnEnter?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "输入消息...",
    enableBlockEdit: false,
    enableAi: true,
    enableTopBar: false,
    compact: false,
    submitOnEnter: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();
const appearance = useAppearanceStore();

function handleKeydown(event: KeyboardEvent) {
  if (!props.submitOnEnter) return;
  if (event.key !== "Enter" || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  const shouldSubmit = appearance.composerSendWithEnter
    ? !event.shiftKey
    : event.shiftKey;
  if (!shouldSubmit) return;
  event.preventDefault();
  event.stopPropagation();
  const editor = (event.target as HTMLElement | null)?.closest?.(".ProseMirror");
  if (!(editor?.textContent ?? props.modelValue).trim()) return;
  emit("submit");
}

const ComposerInner = defineComponent({
  name: "ConversationComposerEditorInner",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
    placeholder: {
      type: String,
      default: "输入消息...",
    },
    enableBlockEdit: {
      type: Boolean,
      default: false,
    },
    enableAi: {
      type: Boolean,
      default: true,
    },
    enableTopBar: {
      type: Boolean,
      default: false,
    },
  },
  emits: {
    "update:modelValue": (_value: string) => true,
  },
  setup(innerProps, { emit: innerEmit }) {
    const currentMarkdown = ref(innerProps.modelValue);
    const editorFeatures = computed(() => ({
      ...conversationCrepeFeatures,
      [CrepeFeature.BlockEdit]: innerProps.enableBlockEdit,
      [CrepeFeature.AI]: innerProps.enableAi,
      [CrepeFeature.TopBar]: innerProps.enableTopBar,
    }));
    let applyingExternalValue = false;
    let pendingExternalValue = false;
    const { loading, get } = useEditor((root) => {
      const editor = new Crepe({
        root,
        defaultValue: innerProps.modelValue,
        features: editorFeatures.value,
        featureConfigs: {
          ...conversationCrepeFeatureConfigs,
          [CrepeFeature.Placeholder]: {
            text: innerProps.placeholder,
            mode: "block",
          },
        },
      });
      editor.on((listener) => {
        listener.markdownUpdated((_ctx, nextMarkdown, previousMarkdown) => {
          if (applyingExternalValue || nextMarkdown === previousMarkdown) {
            return;
          }
          currentMarkdown.value = nextMarkdown;
          innerEmit("update:modelValue", nextMarkdown);
        });
      });
      return editor;
    });

    function replaceMarkdown(markdown: string) {
      const editor = get();
      if (!editor || loading.value) {
        pendingExternalValue = true;
        return;
      }
      applyingExternalValue = true;
      try {
        editor.action(replaceAll(markdown, true));
      } finally {
        applyingExternalValue = false;
        pendingExternalValue = false;
      }
    }

    watch(
      () => innerProps.modelValue,
      (markdown) => {
        if (markdown === currentMarkdown.value) {
          return;
        }
        currentMarkdown.value = markdown;
        replaceMarkdown(markdown);
      },
    );

    watch(loading, (isLoading) => {
      if (!isLoading && pendingExternalValue) {
        replaceMarkdown(currentMarkdown.value);
      }
    });

    return () => h(Milkdown);
  },
});
</script>

<template>
  <MilkdownProvider>
    <div
      class="conversation-composer-editor min-h-10 min-w-0 w-full mobile:min-h-12"
      :class="{
        'conversation-composer-editor--block-edit': props.enableBlockEdit,
        'conversation-composer-editor--compact': props.compact,
      }"
      @keydown.capture="handleKeydown"
    >
      <ComposerInner
        :model-value="props.modelValue"
        :placeholder="props.placeholder"
        :enable-block-edit="props.enableBlockEdit"
        :enable-ai="props.enableAi"
        :enable-top-bar="props.enableTopBar"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
  </MilkdownProvider>
</template>

<style>
.conversation-composer-editor :where(.milkdown, .editor, .ProseMirror) {
  min-height: 5.5rem !important; /* Made it taller to avoid blocking text selection popups */
  min-width: 0 !important;
  width: 100%;
  max-height: 16rem;
  max-width: 100%;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  outline: none !important;
}

.conversation-composer-editor :where(.milkdown, .editor) {
  overflow: hidden !important;
  padding: 0 !important;
}

.conversation-composer-editor--block-edit :where(.milkdown, .editor) {
  overflow: visible !important;
}

.conversation-composer-editor--block-edit .milkdown {
  position: relative;
}

.conversation-composer-editor .ProseMirror {
  overflow-y: auto !important;
  padding: 0.4rem 0.35rem 2rem 0.35rem !important; /* Added 2rem bottom padding for selection toolbar */
  font-size: var(--editor-font-size, 14px) !important;
  line-height: var(--editor-line-height, 16px) !important;
}

.mobile-layout .conversation-composer-editor .ProseMirror {
  min-height: 6rem !important;
  max-height: 12rem;
  padding: 0.5rem 0.45rem 2rem 0.45rem !important;
  font-size: var(--editor-font-size, 14px) !important;
}

.conversation-composer-editor .ProseMirror > * {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

.message-inline-editor :where(.milkdown, .editor, .ProseMirror) {
  max-height: none !important;
}

.conversation-composer-editor--compact,
.conversation-composer-editor--compact :where(.milkdown, .editor, .ProseMirror) {
  min-height: 2.25rem !important;
}

.conversation-composer-editor--compact .ProseMirror {
  max-height: 8rem !important;
  padding: 0.1rem 0.25rem 0.2rem !important;
  font-size: var(--editor-font-size, 14px) !important;
  line-height: var(--editor-line-height, 16px) !important;
}

.mobile-layout .conversation-composer-editor--compact .ProseMirror {
  min-height: 2.25rem !important;
  padding: 0.1rem 0.25rem 0.2rem !important;
  font-size: var(--editor-font-size, 14px) !important;
}
</style>
