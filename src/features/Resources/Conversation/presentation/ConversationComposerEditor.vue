<script setup lang="ts">
import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/vue";
import { computed, defineComponent, h, ref, watch } from "vue";
import { conversationCrepeFeatureConfigs, conversationCrepeFeatures } from "./conversation-crepe";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    enableBlockEdit?: boolean;
    enableAi?: boolean;
  }>(),
  {
    modelValue: "",
    placeholder: "输入消息...",
    enableBlockEdit: false,
    enableAi: true,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  submit: [];
}>();

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
    }));
    let applyingExternalValue = false;
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
        return;
      }
      applyingExternalValue = true;
      try {
        editor.action(replaceAll(markdown, true));
      } finally {
        applyingExternalValue = false;
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
      if (!isLoading) {
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
      class="conversation-composer-editor min-h-12 mobile:min-h-14"
      :class="{ 'conversation-composer-editor--block-edit': props.enableBlockEdit }"
      @keydown.ctrl.enter.prevent="emit('submit')"
    >
      <ComposerInner
        :model-value="props.modelValue"
        :placeholder="props.placeholder"
        :enable-block-edit="props.enableBlockEdit"
        :enable-ai="props.enableAi"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
  </MilkdownProvider>
</template>

<style>
.conversation-composer-editor :where(.milkdown, .editor, .ProseMirror) {
  min-height: 3rem !important;
  max-height: 12rem;
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
  padding: 0.45rem 0.25rem !important;
  font-size: 0.92rem;
  line-height: 1.55;
}

.mobile-layout .conversation-composer-editor .ProseMirror {
  min-height: 3.5rem !important;
  max-height: 9rem;
  padding: 0.65rem 0.35rem !important;
  font-size: 1rem;
}

.conversation-composer-editor .ProseMirror > * {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}
</style>
