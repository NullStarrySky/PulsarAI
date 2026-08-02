<script setup lang="ts">
import { computed, type Component } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import SettingGroup from "@/features/Setting/presentation/SettingGroup.vue";
import SettingItem from "@/features/Setting/presentation/SettingItem.vue";
import { resolvePluginComponentByName } from "@/features/Resources/Plugin/application/plugin-vue-runtime";
import {
  parsePluginManifest,
  setManifestValue,
  type PluginManifestContent,
  type PluginManifestValue,
} from "@/features/Resources/Plugin/domain/plugin-manifest";
import type { Plugin } from "@/features/Resources/Plugin/domain/plugin-types";
import ManifestCheckboxControl from "./manifest-controls/ManifestCheckboxControl.vue";
import ManifestInputControl from "./manifest-controls/ManifestInputControl.vue";
import ManifestMediaSelectControl from "./manifest-controls/ManifestMediaSelectControl.vue";
import ManifestSelectControl from "./manifest-controls/ManifestSelectControl.vue";
import ManifestSliderControl from "./manifest-controls/ManifestSliderControl.vue";
import ManifestSwitchControl from "./manifest-controls/ManifestSwitchControl.vue";
import ManifestTextareaControl from "./manifest-controls/ManifestTextareaControl.vue";

const props = withDefaults(defineProps<{
  modelValue?: string;
  plugin: Plugin;
  plugins?: Plugin[];
  readonly?: boolean;
}>(), { modelValue: "[]", plugins: () => [], readonly: false });
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const builtins: Record<string, Component> = {
  checkbox: ManifestCheckboxControl,
  input: ManifestInputControl,
  mediaselect: ManifestMediaSelectControl,
  select: ManifestSelectControl,
  slider: ManifestSliderControl,
  switch: ManifestSwitchControl,
  textarea: ManifestTextareaControl,
};

const parsedSource = computed(() => {
  try {
    return { value: JSON.parse(props.modelValue || "[]") as unknown, error: "" };
  } catch (error) {
    return {
      value: [],
      error: error instanceof Error ? error.message : "JSON 语法错误",
    };
  }
});
const parsed = computed(() => parsePluginManifest(parsedSource.value.value));
const componentRuntime = computed(() => {
  const components = new Map<string, Component>();
  const diagnostics: string[] = [];
  for (const group of parsed.value.manifest) {
    for (const content of group.content) {
      const key = content.component.toLocaleLowerCase();
      const builtin = builtins[key];
      if (builtin) {
        components.set(content.component, builtin);
        continue;
      }
      if (components.has(content.component)) continue;
      const result = resolvePluginComponentByName(props.plugin, content.component);
      diagnostics.push(...result.diagnostics.map(
        (message) => `${group.group.id}/${content.id}：${message}`,
      ));
      if (result.component) components.set(content.component, result.component);
    }
  }
  return { components, diagnostics };
});
const diagnostics = computed(() => [
  ...(parsedSource.value.error ? [`JSON：${parsedSource.value.error}`] : []),
  ...parsed.value.diagnostics.map((item) => `${item.path}：${item.message}`),
  ...componentRuntime.value.diagnostics,
]);

function control(component: string) {
  return componentRuntime.value.components.get(component) ?? null;
}

function controlProps(content: PluginManifestContent) {
  return {
    ...(content.props ?? {}),
    ...(content.component.toLocaleLowerCase() === "mediaselect"
      ? { plugins: props.plugins }
      : {}),
  };
}

function updateValue(groupId: string, contentId: string, value: PluginManifestValue) {
  if (props.readonly || diagnostics.value.some((item) => item.startsWith("JSON："))) return;
  const manifest = structuredClone(parsed.value.manifest);
  setManifestValue(manifest, groupId, contentId, value);
  emit("update:modelValue", JSON.stringify(manifest, null, 2));
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-background">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 pb-12 pt-4 mobile:px-3">
      <Alert v-if="diagnostics.length" variant="destructive">
        <AlertTitle>Manifest 配置存在问题</AlertTitle>
        <AlertDescription>
          <ul class="list-disc pl-4">
            <li v-for="item in diagnostics" :key="item">{{ item }}</li>
          </ul>
        </AlertDescription>
      </Alert>

      <SettingGroup
        v-for="groupContent in parsed.manifest"
        :key="groupContent.group.id"
        :title="groupContent.group.title"
        :description="groupContent.group.description"
      >
        <SettingItem
          v-for="content in groupContent.content"
          :key="content.id"
          :title="content.title"
          :description="content.description"
        >
          <component
            :is="control(content.component)"
            v-if="control(content.component)"
            :model-value="content.value"
            :disabled="readonly"
            v-bind="controlProps(content)"
            @update:model-value="updateValue(groupContent.group.id, content.id, $event)"
          />
          <span v-else class="text-xs text-destructive">
            无法加载组件 {{ content.component }}
          </span>
        </SettingItem>
      </SettingGroup>

      <p v-if="!parsed.manifest.length && !diagnostics.length" class="py-12 text-center text-sm text-muted-foreground">
        manifest.json 还没有 GroupContent 配置。
      </p>
    </div>
  </div>
</template>
