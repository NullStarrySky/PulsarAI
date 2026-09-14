<script setup lang="ts">
import { computed, ref } from "vue";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingItem from "@/features/Setting/components/SettingItem.vue";
import { ArrowDown, ArrowUp, Plus, X } from "@/lib/phosphor-icons";
import type { ResourcePath } from "../../../dataflow/types";
import type { FileApiOptions } from "../../../dataflow/use-file-api";
import { useFileApi } from "../../../dataflow/use-file-api";
import { importBuiltinPlugins } from "../../../utils/import-converter";
import { parseCharacterDefinition } from "./plugin-character";

const props = defineProps<FileApiOptions & { path: ResourcePath }>();
const content = useFileApi(props).useFileContent(() => props.path);
const definition = computed(() => parseCharacterDefinition(content.value));
const newPlugin = ref("");
const availablePlugins = computed(() =>
	Object.keys(importBuiltinPlugins()).filter(
		(folder) => !definition.value.globalPlugins.includes(folder),
	),
);

function update(key: "name" | "description" | "globalPlugins", value: unknown) {
	let source: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(content.value);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
			source = parsed as Record<string, unknown>;
	} catch {}
	source[key] = value;
	content.value = JSON.stringify(source, null, 2);
}

function addPlugin(value = newPlugin.value) {
	const folder = value.trim();
	if (
		!folder ||
		folder.includes("/") ||
		definition.value.globalPlugins.includes(folder)
	)
		return;
	update("globalPlugins", [...definition.value.globalPlugins, folder]);
	newPlugin.value = "";
}

function movePlugin(index: number, offset: number) {
	const target = index + offset;
	if (target < 0 || target >= definition.value.globalPlugins.length) return;
	const next = [...definition.value.globalPlugins];
	[next[index], next[target]] = [next[target]!, next[index]!];
	update("globalPlugins", next);
}
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto bg-background">
    <div class="mx-auto w-full max-w-5xl px-4 pb-12 pt-4 mobile:px-3">
      <SettingGroup>
        <SettingItem title="角色名称"><Input class="w-full sm:w-72" :model-value="definition.name" @update:model-value="update('name', String($event))" /></SettingItem>
        <SettingItem title="角色描述"><Textarea class="w-full sm:w-96" :model-value="definition.description ?? ''" @update:model-value="update('description', String($event))" /></SettingItem>
        <SettingItem title="全局插件" description="按文件夹名称启用；列表顺序也是合并顺序。">
          <div class="flex w-full max-w-md flex-col gap-2">
            <div v-for="(folder, index) in definition.globalPlugins" :key="folder" class="flex items-center gap-1 rounded-md border bg-muted/20 px-2 py-1"><code class="min-w-0 flex-1 truncate text-xs">{{ folder }}</code><Button variant="ghost" size="icon-sm" :disabled="index === 0" title="上移" @click="movePlugin(index, -1)"><ArrowUp class="size-3.5" /></Button><Button variant="ghost" size="icon-sm" :disabled="index === definition.globalPlugins.length - 1" title="下移" @click="movePlugin(index, 1)"><ArrowDown class="size-3.5" /></Button><Button variant="ghost" size="icon-sm" title="停用" @click="update('globalPlugins', definition.globalPlugins.filter((item) => item !== folder))"><X class="size-3.5" /></Button></div>
            <div v-if="availablePlugins.length" class="flex flex-wrap gap-1"><Button v-for="folder in availablePlugins" :key="folder" variant="outline" size="sm" @click="addPlugin(folder)"><Plus class="size-3.5" />{{ folder }}</Button></div>
            <div class="flex gap-2"><Input v-model="newPlugin" placeholder="插件文件夹名称" @keydown.enter.prevent="addPlugin()" /><Button variant="outline" size="sm" :disabled="!newPlugin.trim()" @click="addPlugin()"><Plus class="size-4" />启用</Button></div>
          </div>
        </SettingItem>
      </SettingGroup>
    </div>
  </div>
</template>
