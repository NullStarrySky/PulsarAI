<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { useRequestStore } from "../../../request-store";
import {
	deletePiperModel,
	downloadPiperModel,
	listPiperModels,
	type PiperModelDownloadPack,
} from "../../piper/client";
import {
	deleteWhisperModel,
	downloadWhisperModel,
	listWhisperModels,
	type WhisperModelDownloadPack,
} from "../../whisper-candle/client";

const props = defineProps<{ type: "piper" | "whisper" }>();
const store = useRequestStore();
const downloading = ref(false);
const models = ref<
	Array<{ id: string; version: string; size: number; language?: string }>
>([]);
const form = reactive({
	id: "",
	version: "",
	url: "",
	sha256: "",
	size: "",
	language: "",
});
const providerId = () => (props.type === "piper" ? "piper" : "whisper-candle");
const kind = () =>
	props.type === "piper" ? ("speech" as const) : ("transcribe" as const);
async function refresh() {
	models.value =
		props.type === "piper"
			? await listPiperModels()
			: await listWhisperModels();
	await store.upsertModels(
		providerId(),
		kind(),
		models.value.map((item) => ({
			id: item.id,
			displayName: item.id,
			enabled: true,
			extraInfo: {
				version: item.version,
				...(item.language ? { language: item.language } : {}),
			},
		})),
	);
}
async function download() {
	const size = Number(form.size);
	if (
		!form.id ||
		!form.version ||
		!form.url ||
		!form.sha256 ||
		!Number.isSafeInteger(size) ||
		size <= 0
	)
		throw new Error("请填写模型 ID、版本、下载地址、SHA-256 和字节大小。");
	downloading.value = true;
	try {
		if (props.type === "piper")
			await downloadPiperModel(
				{
					id: form.id,
					version: form.version,
					sha256: form.sha256,
					size,
					language: form.language || undefined,
					runtime: "sherpa-onnx-piper",
				} satisfies PiperModelDownloadPack,
				form.url,
			);
		else
			await downloadWhisperModel(
				{
					id: form.id,
					version: form.version,
					sha256: form.sha256,
					size,
					language: form.language || undefined,
					runtime: "whisper-candle-core",
				} satisfies WhisperModelDownloadPack,
				form.url,
			);
		await refresh();
	} finally {
		downloading.value = false;
	}
}
async function remove(id: string) {
	if (props.type === "piper") await deletePiperModel(id);
	else await deleteWhisperModel(id);
	await refresh();
}
onMounted(() => void refresh());
</script>
<template>
  <div class="space-y-3 rounded-md border p-3"><p class="text-sm font-medium">本地模型</p><div v-for="model in models" :key="model.id" class="flex items-center gap-2 text-sm"><span class="min-w-0 flex-1 truncate">{{ model.id }} · {{ model.version }}</span><Button size="sm" variant="ghost" @click="remove(model.id)">删除</Button></div><div class="grid gap-2 sm:grid-cols-2"><Input v-model="form.id" placeholder="模型 ID" /><Input v-model="form.version" placeholder="版本" /><Input v-model="form.url" class="sm:col-span-2" placeholder="下载 URL" /><Input v-model="form.sha256" class="sm:col-span-2" placeholder="SHA-256" /><Input v-model="form.size" type="number" placeholder="字节大小" /><Input v-model="form.language" placeholder="语言（可选）" /></div><Button size="sm" :disabled="downloading" @click="download">{{ downloading ? '下载中…' : '下载并校验' }}</Button></div>
</template>
