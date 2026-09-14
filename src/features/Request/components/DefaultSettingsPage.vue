<script setup lang="ts">
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import { useRequestDefaults } from "../defaults";
import DefaultPicker from "./DefaultPicker.vue";

const request = useRequestDefaults();
</script>

<template>
  <SettingPage title="默认项" description="选择默认模型；选择后可直接修改该提供商允许显示的参数。">
    <SettingGroup title="模型">
      <SettingItem title="默认模型" description="未显式指定时的对话模型。"><DefaultPicker v-model="request.defaults.defaultChatModel" kind="text" /></SettingItem>
      <SettingItem title="快速模型" description="用于低延迟、低成本任务。"><DefaultPicker v-model="request.defaults.fastModel" kind="text" /></SettingItem>
      <SettingItem title="图片生成模型" description="用于文生图或图像编辑。"><DefaultPicker v-model="request.defaults.imageModel" kind="image" allow-empty /></SettingItem>
      <SettingItem title="语音生成模型" description="用于文本转语音。"><DefaultPicker v-model="request.defaults.speechModel" kind="speech" allow-empty /></SettingItem>
      <SettingItem title="语音转写模型" description="用于将音频转换为文字。"><DefaultPicker v-model="request.defaults.transcriptionModel" kind="transcribe" allow-empty /></SettingItem>
    </SettingGroup>
  </SettingPage>
</template>
