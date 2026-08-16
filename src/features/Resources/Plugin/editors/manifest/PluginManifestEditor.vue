<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingItem from "@/features/Setting/components/SettingItem.vue";
import { resolvePluginComponentByName } from "@/features/Resources/Plugin/editors/vue/plugin-vue-runtime";
import {
  parsePluginManifest,
  setManifestValue,
  type PluginManifestContent,
  type PluginManifestValue,
} from "@/features/Resources/Plugin/editors/manifest/plugin-manifest";
import type { Plugin } from "@/features/Resources/Plugin/tree/plugin-types";
import ManifestCheckboxControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestCheckboxControl.vue";
import ManifestInputControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestInputControl.vue";
import ManifestMediaSelectControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestMediaSelectControl.vue";
import ManifestModelSelectControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestModelSelectControl.vue";
import ManifestPathSelectControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestPathSelectControl.vue";
import ManifestSelectControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestSelectControl.vue";
import ManifestSliderControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestSliderControl.vue";
import ManifestSwitchControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestSwitchControl.vue";
import ManifestTextareaControl from "@/features/Resources/Plugin/editors/manifest/controls/ManifestTextareaControl.vue";

const props = withDefaults(defineProps<{
  modelValue?: string;
  plugin: Plugin;
  plugins?: Plugin[];
  readonly?: boolean;
}>(), { modelValue: "[]", plugins: () => [], readonly: false });
const emit = defineEmits<{
  "update:modelValue": [value: string];
  "config-change": [change: { groupId: string; contentId: string; value: PluginManifestValue }];
}>();

const builtins: Record<string, Component> = {
  checkbox: ManifestCheckboxControl,
  input: ManifestInputControl,
  mediaselect: ManifestMediaSelectControl,
  modelselect: ManifestModelSelectControl,
  pathselect: ManifestPathSelectControl,
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
const activeGroupId = ref("");
watch(
  () => parsed.value.manifest.map((item) => item.group.id),
  (groupIds) => {
    if (!groupIds.includes(activeGroupId.value)) activeGroupId.value = groupIds[0] ?? "";
  },
  { immediate: true },
);
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
    ...(content.component.toLocaleLowerCase() === "pathselect"
      ? { plugins: props.plugins, plugin: props.plugin }
      : {}),
  };
}

function updateValue(groupId: string, contentId: string, value: PluginManifestValue) {
  if (props.readonly || diagnostics.value.some((item) => item.startsWith("JSON："))) return;
  const manifest = structuredClone(parsed.value.manifest);
  setManifestValue(manifest, groupId, contentId, value);
  emit("update:modelValue", JSON.stringify(manifest, null, 2));
  emit("config-change", { groupId, contentId, value });
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

      <Tabs v-if="parsed.manifest.length" v-model="activeGroupId">
        <TabsList class="h-9 rounded-full bg-muted/70 p-1">
          <TabsTrigger
            v-for="groupContent in parsed.manifest"
            :key="groupContent.group.id"
            :value="groupContent.group.id"
            class="rounded-full px-4 text-xs"
          >
            {{ groupContent.group.title }}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          v-for="groupContent in parsed.manifest"
          :key="groupContent.group.id"
          :value="groupContent.group.id"
          class="mt-2"
        >
          <SettingGroup>
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
        </TabsContent>
      </Tabs>

      <p v-if="!parsed.manifest.length && !diagnostics.length" class="py-12 text-center text-sm text-muted-foreground">
        manifest.json 还没有 GroupContent 配置。
      </p>
    </div>
  </div>
</template>
