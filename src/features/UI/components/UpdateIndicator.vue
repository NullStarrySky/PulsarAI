<script setup lang="ts">
import {
	CheckCircle2,
	Download,
	LoaderCircle,
	RefreshCw,
} from "lucide-vue-next";
import { push } from "notivue";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Button } from "@/components/fluid";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { HostUpdateInfo } from "@/host";
import { host } from "@/host";

defineProps<{ buttonClass?: string }>();
const updater = host.desktop?.update;
const update = ref<HostUpdateInfo | null>(null);
const checking = ref(false);
const downloading = ref(false);
const downloaded = ref(false);
const progress = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;
let unlisten: (() => void) | null = null;

async function check(silent = false) {
	if (!updater || checking.value) return;
	checking.value = true;
	try {
		update.value = await updater.check();
		if (!silent && !update.value) push.success("已经是最新版本");
	} catch (error) {
		if (!silent)
			push.error(error instanceof Error ? error.message : "检查更新失败");
	} finally {
		checking.value = false;
	}
}

async function download() {
	if (!updater || downloading.value) return;
	downloading.value = true;
	try {
		progress.value = 0;
		await updater.download();
		downloaded.value = true;
	} catch (error) {
		push.error(error instanceof Error ? error.message : "下载更新失败");
	} finally {
		downloading.value = false;
	}
}

async function install() {
	if (!updater) return;
	try {
		await updater.install();
	} catch (error) {
		push.error(error instanceof Error ? error.message : "启动安装包失败");
	}
}

onMounted(() => {
	if (!updater) return;
	void check(true);
	timer = setInterval(() => void check(true), 60 * 60 * 1000);
	unlisten = updater.listen((event) => {
		if (event.type === "download-progress") progress.value = event.percent;
		if (event.type === "downloaded") downloaded.value = true;
		if (event.type === "error") push.error(event.message);
	});
});
onBeforeUnmount(() => {
	if (timer) clearInterval(timer);
	unlisten?.();
});
</script>

<template>
  <Popover v-if="updater && update">
    <PopoverTrigger as-child>
      <Button variant="ghost" size="sm" class="h-7 gap-1.5 rounded-full px-2 text-xs" :class="buttonClass" title="有可用更新">
        <Download class="size-3.5" />v{{ update.version }}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" class="w-72 space-y-3 p-3" data-window-drag-block>
      <div><p class="text-sm font-semibold">{{ update.name }}</p><p class="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-muted-foreground">{{ update.notes || '新版本已准备好。' }}</p></div>
      <Button v-if="downloaded" class="w-full" @click="install"><CheckCircle2 class="size-4" />安装并重启</Button>
      <Button v-else class="w-full" :disabled="downloading" @click="download"><LoaderCircle v-if="downloading" class="size-4 animate-spin" /><Download v-else class="size-4" />{{ downloading ? progress === null ? '正在下载…' : `正在下载 ${progress}%` : '下载安装包' }}</Button>
      <Button variant="ghost" size="sm" class="w-full" :disabled="checking" @click="check(false)"><RefreshCw class="size-3.5" />重新检查</Button>
    </PopoverContent>
  </Popover>
</template>
