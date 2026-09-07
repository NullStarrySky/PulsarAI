<script setup lang="ts">
import { RadioGroup, RadioGroupItem } from "@/components/fluid";
import SettingForm from "@/features/Setting/components/SettingForm.vue";
import SettingFormField from "@/features/Setting/components/SettingFormField.vue";
import SettingPage from "@/features/Setting/components/SettingPage.vue";
import { usePanelEnvironment, type PanelDirection } from "./panel-environment";
const { left, right } = usePanelEnvironment();
const options: Array<{ value: PanelDirection; label: string }> = [{ value: "vertical", label: "纵向" }, { value: "horizontal", label: "横向" }];
</script>

<template>
  <SettingPage title="会话面板">
    <SettingForm>
      <SettingFormField title="左侧面板排列" description="只保存在当前设备的环境设置中。">
        <RadioGroup v-model="left" class="flex gap-3"><RadioGroupItem v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</RadioGroupItem></RadioGroup>
      </SettingFormField>
      <SettingFormField title="右侧面板排列" description="窄窗口会自动改为抽屉，不挤压聊天区。">
        <RadioGroup v-model="right" class="flex gap-3"><RadioGroupItem v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</RadioGroupItem></RadioGroup>
      </SettingFormField>
    </SettingForm>
  </SettingPage>
</template>
