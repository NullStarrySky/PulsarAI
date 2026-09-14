<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Button } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { host } from "@/host";

const props = defineProps<{ name: string; title?: string }>();
const value = ref("");
const preview = ref("");
const saving = ref(false);

async function refresh() {
	preview.value = await host.secrets.preview(props.name);
}
async function save() {
	saving.value = true;
	try {
		if (value.value.trim())
			await host.secrets.set(props.name, value.value.trim());
		else await host.secrets.clearValue(props.name);
		value.value = "";
		await refresh();
	} finally {
		saving.value = false;
	}
}
onMounted(() => void refresh());
</script>

<template>
  <div class="flex min-h-11 items-center gap-3">
    <div class="min-w-0 flex-1">
      <p class="text-sm font-medium">{{ title || name }}</p>
      <p class="truncate text-xs text-muted-foreground">{{ preview || '未设置' }}</p>
    </div>
    <Input v-model="value" type="password" class="max-w-48" placeholder="输入新值" @keyup.enter="save" />
    <Button size="sm" :disabled="saving" @click="save">保存</Button>
  </div>
</template>
