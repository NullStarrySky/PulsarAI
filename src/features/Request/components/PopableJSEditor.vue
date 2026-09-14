<script setup lang="ts">
import { ref } from "vue";
import {
	Button,
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/fluid";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps<{ modelValue: string; title?: string }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const draft = ref(props.modelValue);
function save() {
	emit("update:modelValue", draft.value);
}
</script>
<template><Dialog><DialogTrigger as-child><Button size="sm" variant="outline">{{ title || '编辑 JavaScript' }}</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>{{ title || 'JavaScript' }}</DialogTitle></DialogHeader><Textarea v-model="draft" class="min-h-72 font-mono text-xs" /><Button @click="save">保存</Button></DialogContent></Dialog></template>
