<script setup lang="ts">
import { computed, ref } from "vue";
import { Button, TabItem, Tabs, TabsList } from "@/components/fluid";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSyncStore } from "@/features/Database/dbsync-store";
import FileTree, {
	type FileTreeNode,
} from "@/features/Plugin/components/FileTree.vue";
import { useFileApi } from "@/features/Plugin/dataflow/use-file-api";
import { useEditablePluginData } from "@/features/Plugin/dataflow/use-plugin-data";
import { host } from "@/host";
import { Code, Eye, FilePlus2, Play, Upload } from "@/lib/phosphor-icons";
import StPresetRenderer from "../renderers/StPresetRenderer.vue";
import StWorldbookRenderer from "../renderers/StWorldbookRenderer.vue";
import { applyStImportPlan } from "./st-import-apply";
import {
	buildStImportPlan,
	readStResourceFile,
	type StImportPlan,
	type StResourceFile,
	tryBuildStImportPlan,
} from "./st-import-plan";
import { stTestRenderers } from "./st-test-renderers";

const sync = useSyncStore();
void sync.init();
const localPluginId = computed(() => [...sync.characters][0]?.id ?? "");
const workspace = useEditablePluginData(localPluginId);
const world = useFileApi(workspace);
const source = ref<StResourceFile | null>(null);
const plan = ref<StImportPlan | null>(null);
const error = ref("");
const applied = ref("");
const viewMode = ref<"render" | "source">("render");
const expandedPaths = ref<string[]>([]);

const raw = computed(
	() =>
		source.value?.text ??
		(source.value?.base64 ? `[${source.value.mediaType ?? "binary"}]` : ""),
);

const sourceKind = computed<"worldbook" | "preset" | "other">(() => {
	if (!source.value?.text) return "other";
	try {
		const obj = JSON.parse(source.value.text);
		if (obj && typeof obj === "object") {
			if ("entries" in obj) return "worldbook";
			if ("prompts" in obj || "prompt_order" in obj) return "preset";
		}
	} catch {}
	return "other";
});

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
	syncExpanded(rendered.plan);
}

function convert() {
	if (!source.value) return;
	error.value = "";
	applied.value = "";
	try {
		const built =
			tryBuildStImportPlan(source.value.fileName, source.value) ??
			buildStImportPlan(source.value.fileName, source.value);
		plan.value = built;
		syncExpanded(built);
	} catch (cause) {
		plan.value = null;
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
}

async function apply() {
	if (!plan.value) return;
	try {
		const result = await applyStImportPlan(world, plan.value, "/");
		applied.value = `已写入测试 World：${result.createdPaths.length} 个节点`;
	} catch (cause) {
		error.value = cause instanceof Error ? cause.message : String(cause);
	}
}

function syncExpanded(targetPlan: StImportPlan | null) {
	if (!targetPlan) return;
	const paths = new Set<string>();
	for (const f of targetPlan.files) {
		const parts = f.path.replace(/^\/+/, "").split("/");
		let current = "";
		for (let i = 0; i < parts.length - 1; i++) {
			current = current ? `${current}/${parts[i]}` : parts[i]!;
			paths.add(`folder:${current}`);
		}
	}
	expandedPaths.value = Array.from(paths);
}

// Map standard plan.tree and plan.meta into FileTreeNode structure
const planTreeNodes = computed<FileTreeNode[]>(() => {
	if (!plan.value) return [];
	const { tree, meta } = plan.value;

	function treeToNodes(currentTree: Record<string, any>, prefix = ""): FileTreeNode[] {
		const list: FileTreeNode[] = [];
		for (const [name, node] of Object.entries(currentTree)) {
			const fullPath = prefix ? `${prefix}/${name}` : name;
			const absPath = `/${fullPath}`;
			if (typeof node === "object" && node !== null) {
				list.push({
					id: `folder:${fullPath}`,
					name,
					type: "folder",
					children: treeToNodes(node, fullPath),
					data: { path: fullPath },
				});
			} else {
				const ext = name.split(".").pop() || "";
				const icon =
					ext === "md"
						? "file-text"
						: ext === "json"
							? "file-code"
							: ext === "vue"
								? "file-code-2"
								: "file";
				const fileMeta = meta[absPath] as any;
				list.push({
					id: `file:${fullPath}`,
					name,
					type: "file",
					icon,
					suffix: fileMeta?.slot
						? `slot: ${fileMeta.slot.replace("/localSlot/", "")}`
						: undefined,
					data: { content: node, path: absPath },
				});
			}
		}
		return list.sort((a, b) =>
			a.type === b.type
				? a.name.localeCompare(b.name)
				: a.type === "folder"
					? -1
					: 1,
		);
	}

	return treeToNodes(tree);
});

function handleSelectTreeNode(node: FileTreeNode) {
	if (node.type !== "file" || !node.data?.file) return;
	applied.value = `计划文件：${node.data.path}`;
}
</script>

<template>
  <div class="grid h-full min-h-0 gap-3 p-3 md:grid-cols-[minmax(0,1.2fr)_14rem_minmax(0,1fr)]">
    <!-- Left Column: Source Resource -->
    <section class="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
      <div class="mb-2.5 flex items-center justify-between border-b pb-2">
        <div class="flex items-center gap-2">
          <h2 class="text-xs font-semibold text-foreground">原始资源</h2>
          <Tabs v-if="sourceKind !== 'other'" v-model="viewMode" size="compact">
            <TabsList>
              <TabItem value="render" class="h-6 px-2 text-[11px]"><Eye class="mr-1 size-3" />渲染</TabItem>
              <TabItem value="source" class="h-6 px-2 text-[11px]"><Code class="mr-1 size-3" />源码</TabItem>
            </TabsList>
          </Tabs>
        </div>
        <Button size="sm" class="h-7 gap-1 px-2.5 text-xs" @click="choose">
          <Upload class="size-3.5" />上传
        </Button>
      </div>

      <!-- Quick Fixtures Bar -->
      <div class="mb-2 flex flex-wrap gap-1">
        <Button
          v-for="renderer in stTestRenderers"
          :key="renderer.kind"
          size="sm"
          variant="outline"
          class="h-6 px-2 text-[11px]"
          @click="renderFixture(renderer.kind)"
        >
          {{ renderer.label }}
        </Button>
      </div>
      <p class="mb-2 text-[11px] text-muted-foreground truncate">
        {{ source?.fileName ?? "选择测试类型或上传资源" }}
      </p>

      <!-- Source Display: Rendered Accordion vs Raw JSON -->
      <div class="min-h-0 flex-1 overflow-hidden rounded-xl border bg-muted/20">
        <StWorldbookRenderer
          v-if="sourceKind === 'worldbook' && viewMode === 'render' && source?.text"
          :model-value="source.text"
          class="h-full"
          @update:model-value="source && (source.text = $event)"
        />
        <StPresetRenderer
          v-else-if="sourceKind === 'preset' && viewMode === 'render' && source?.text"
          :model-value="source.text"
          class="h-full"
          @update:model-value="source && (source.text = $event)"
        />
        <ScrollArea v-else class="h-full p-3">
          <pre class="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{{ raw || '暂无资源数据' }}</pre>
        </ScrollArea>
      </div>
    </section>

    <!-- Center Column: Operations -->
    <section class="flex min-h-0 flex-col justify-center gap-3 rounded-2xl border border-border/80 bg-muted/20 p-4 shadow-xs">
      <Button :disabled="!source" class="h-9 gap-1.5 text-xs" @click="convert">
        <Play class="size-4" />转换为内存计划
      </Button>
      <Button :disabled="!plan" variant="outline" class="h-9 gap-1.5 text-xs" @click="apply">
        <FilePlus2 class="size-4" />应用到测试 World
      </Button>
      <div class="text-[11px] text-muted-foreground leading-relaxed">
        转换与应用会立即追加到当前 Plugin 版本，并由数据库同步队列持久化。
      </div>
      <div v-if="error" class="rounded-lg bg-destructive/10 p-2 text-xs text-destructive">
        {{ error }}
      </div>
      <div v-if="applied" class="rounded-lg bg-emerald-500/10 p-2 text-xs text-emerald-600 dark:text-emerald-400">
        {{ applied }}
      </div>
      <div v-if="plan" class="rounded-xl border bg-background/80 p-3 text-xs space-y-1">
        <div class="font-medium text-foreground capitalize">{{ plan.kind }} 计划</div>
        <div class="text-muted-foreground">生成文件: {{ plan.files.length }} 个</div>
        <div class="text-muted-foreground">诊断消息: {{ plan.diagnostics.length }} 条</div>
      </div>
    </section>

    <!-- Right Column: Hierarchical File Tree with Floating Editor -->
    <section class="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
      <div class="mb-2.5 flex items-center justify-between border-b pb-2">
        <h2 class="text-xs font-semibold text-foreground">目标树</h2>
        <span v-if="plan" class="text-[10px] text-muted-foreground">点击节点查看路径</span>
      </div>
      <div class="min-h-0 flex-1 overflow-hidden">
        <FileTree
          v-if="plan && planTreeNodes.length"
          :nodes="planTreeNodes"
          :expanded="expandedPaths"
          class="h-full text-xs"
          @select="handleSelectTreeNode"
        />
        <div v-else class="flex h-full items-center justify-center p-6 text-center text-xs text-muted-foreground">
          转换后显示层级文件树，点击具体文件可在浮窗中预览与编辑。
        </div>
      </div>
      <!-- Diagnostics footer -->
      <div v-if="plan?.diagnostics?.length" class="mt-2 border-t pt-2 max-h-24 overflow-y-auto text-[11px] text-muted-foreground space-y-1">
        <div v-for="(diag, idx) in plan.diagnostics" :key="idx" class="truncate">• {{ diag }}</div>
      </div>
    </section>
  </div>
</template>
