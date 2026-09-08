<script setup lang="ts">
import { computed, ref } from "vue";
import { FilePlus2, Play, Upload } from "lucide-vue-next";
import { Button } from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { host } from "@/host";
import { usePluginWorld } from "@/features/Plugin/runtime/file-composables";
import { applyStImportPlan } from "./st-import-apply";
import {
	buildStImportPlan,
	readStResourceFile,
	tryBuildStImportPlan,
	type StImportPlan,
	type StResourceFile,
} from "./st-import-plan";
import { stTestRenderers } from "./st-test-renderers";

const world = usePluginWorld();
const source = ref<StResourceFile | null>(null);
const plan = ref<StImportPlan | null>(null);
const error = ref("");
const applied = ref("");
const raw = computed(
	() =>
		source.value?.text ??
		(source.value?.base64 ? `[${source.value.mediaType ?? "binary"}]` : ""),
);
async function choose() {
	const selected = await host.dialog.open({
		title: "选择 SillyTavern 资源",
		multiple: false,
		directory: false,
		properties: ["openFile"],
		filters: [
			{
				name: "SillyTavern 资源",
				extensions: ["png", "json", "md", "markdown", "txt"],
			},
		],
	});
	if (typeof selected !== "string") return;
	error.value = "";
	applied.value = "";
	source.value = await readStResourceFile(selected);
	plan.value = null;
}
function renderFixture(kind: string) {
	const renderer = stTestRenderers.find((item) => item.kind === kind);
	if (!renderer) return;
	const rendered = renderer.render();
	source.value = rendered.source;
	plan.value = rendered.plan;
	error.value = "";
	applied.value = "";
}
function convert() {
	if (!source.value) return;
	error.value = "";
	applied.value = "";
	try {
		plan.value =
			tryBuildStImportPlan(source.value.fileName, source.value) ??
			buildStImportPlan(source.value.fileName, source.value);
	} catch (cause) {
		plan.value = null;
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
}
async function apply() {
	if (!plan.value) return;
	try {
		const result = await applyStImportPlan(world, plan.value, "/self");
		applied.value = `已写入测试 World：${result.createdPaths.length} 个节点`;
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
}
</script>

<template>
  <div class="grid h-full min-h-0 gap-3 p-3 md:grid-cols-[minmax(0,1fr)_13rem_minmax(0,1fr)]">
    <section class="min-h-0 rounded-xl border bg-card p-3"><div class="mb-3 flex items-center justify-between"><h2 class="font-medium">原始资源</h2><Button size="sm" @click="choose"><Upload class="mr-1 size-4" />上传</Button></div><div class="mb-2 flex flex-wrap gap-1"><Button v-for="renderer in stTestRenderers" :key="renderer.kind" size="sm" variant="outline" @click="renderFixture(renderer.kind)">{{ renderer.label }}</Button></div><p class="mb-2 text-xs text-muted-foreground">{{ source?.fileName ?? "选择测试类型或上传资源" }}</p><ScrollArea class="h-[calc(100%-6.5rem)] rounded-lg bg-muted/30 p-3"><pre class="whitespace-pre-wrap break-words text-xs">{{ raw }}</pre></ScrollArea></section>
    <section class="flex min-h-0 flex-col justify-center gap-3 rounded-xl border bg-muted/15 p-3"><Button :disabled="!source" @click="convert"><Play class="mr-1 size-4" />转换为内存计划</Button><Button :disabled="!plan" variant="outline" @click="apply"><FilePlus2 class="mr-1 size-4" />应用到测试 World</Button><div class="text-xs text-muted-foreground">默认转换不会写入数据库。</div><div v-if="error" class="text-xs text-destructive">{{ error }}</div><div v-if="applied" class="text-xs text-emerald-600">{{ applied }}</div><div v-if="plan" class="text-xs">{{ plan.kind }} · {{ plan.files.length }} 文件<br />{{ plan.diagnostics.length }} 诊断</div></section>
    <section class="min-h-0 rounded-xl border bg-card p-3"><h2 class="mb-3 font-medium">目标树</h2><ScrollArea class="h-[calc(100%-2rem)]"><div v-if="plan" class="space-y-2 text-xs"><div v-for="file in plan.files" :key="file.path" class="rounded bg-muted/40 p-2"><div class="font-mono">{{ file.path }}</div><div v-if="file.slotId" class="mt-1 text-muted-foreground">slot: {{ file.slotId }}</div></div><div v-for="diagnostic in plan.diagnostics" :key="diagnostic" class="text-muted-foreground">{{ diagnostic }}</div></div><p v-else class="text-xs text-muted-foreground">转换后显示计划文件树与诊断。</p></ScrollArea></section>
  </div>
</template>
