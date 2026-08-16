<script setup lang="ts">
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SettingForm from "@/features/Setting/components/SettingForm.vue";
import SettingFormField from "@/features/Setting/components/SettingFormField.vue";
import type { ModelDefinition, ModelProviderDefinition } from "../model-provider";

defineProps<{
  provider: ModelProviderDefinition;
  models: ModelDefinition[];
  selectedModelId: string;
  apiKeyDraft: string;
  hasApiKey: boolean;
}>();

const emit = defineEmits<{
  "update:selectedModelId": [value: string];
  "update:apiKey": [value: string];
  "update:baseUrl": [value: string];
}>();
</script>

<template>
  <SettingForm>
    <SettingFormField title="API Key" description="与 ModelConnection 共享，不在当前 Feature 中复制保存。">
      <Input
        :model-value="apiKeyDraft"
        type="password"
        :placeholder="hasApiKey ? '已填写，输入新值可替换' : '填写 API Key'"
        @update:model-value="emit('update:apiKey', String($event))"
      />
    </SettingFormField>

    <SettingFormField title="API 代理地址" description="由模型提供商统一管理。">
      <Input
        :model-value="provider.baseUrl"
        placeholder="https://api.example.com/v1"
        @update:model-value="emit('update:baseUrl', String($event))"
      />
    </SettingFormField>

    <SettingFormField title="模型" description="仅显示当前能力对应的模型，不包含类型标签和模型编辑表单。">
      <Select :model-value="selectedModelId" @update:model-value="emit('update:selectedModelId', String($event))">
        <SelectTrigger class="w-full sm:w-80">
          <SelectValue placeholder="选择模型" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem v-for="model in models" :key="model.id" :value="model.id">
              {{ model.name }}
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </SettingFormField>

    <slot />
  </SettingForm>
</template>
