<script setup lang="ts">
import { ArchiveRestore, DatabaseBackup, Download, ShieldCheck, Upload } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { useLocalPluginStore } from "@/features/Plugin/local-plugin-store";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingItem from "@/features/Setting/components/SettingItem.vue";
import SettingPage from "@/features/Setting/components/SettingPage.vue";
import BackupResourceRestoreDialog from "./BackupResourceRestoreDialog.vue";
import { useBackupStore } from "./backup-store";
const backup = useBackupStore(); const plugins = useLocalPluginStore(); const restoreOpen = ref(false); const selected = ref("");
const choices = computed(() => plugins.localPlugins.map(item => ({ value: `local-plugin:${item.id}`, label: item.name })));
onMounted(async () => { await Promise.all([backup.initialize(), plugins.refresh()]); });
async function exportSelected() { if (selected.value) await backup.exportResource(selected.value); }
</script>
<template><SettingPage title="版本管理" description="本地 Plugin、其 World 与会话可作为同一资源恢复或导出。"><p v-if="backup.status" class="rounded border p-3 text-sm">{{ backup.status }}</p><SettingGroup title="资源导入与导出"><SettingItem title="导出本地 Plugin" description="归档包含固定定义文件、World 与所属会话。"><div class="flex gap-2"><Select v-model="selected"><SelectTrigger><SelectValue placeholder="选择本地 Plugin" /></SelectTrigger><SelectContent><SelectItem v-for="item in choices" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent></Select><Button :disabled="!selected" @click="exportSelected"><Download />导出</Button><Button @click="backup.importResourceArchive('update')"><Upload />导入</Button></div></SettingItem></SettingGroup><SettingGroup title="本地历史备份"><SettingItem title="创建备份" description="创建当前数据库的历史快照。"><Button @click="backup.createLocalBackup"><DatabaseBackup />立即备份</Button></SettingItem><SettingItem title="历史版本" description="选择后可恢复全部数据库或具体本地 Plugin。"><div class="flex gap-2"><Select v-model="backup.local.selectedBackup"><SelectTrigger><SelectValue placeholder="选择备份" /></SelectTrigger><SelectContent><SelectItem v-for="item in backup.backups" :key="item.id" :value="item.id">{{ item.name }}</SelectItem></SelectContent></Select><Button variant="outline" :disabled="!backup.local.selectedBackup" @click="backup.loadBackupResources().then((ok) => restoreOpen = ok)"><ArchiveRestore />恢复资源</Button><Button variant="outline" :disabled="!backup.local.selectedBackup" @click="backup.restoreLocalBackup"><ShieldCheck />全量恢复</Button></div></SettingItem><SettingItem title="备份目录"><Input :model-value="backup.local.directory" @update:model-value="backup.updateLocal({ directory: String($event) })" /></SettingItem></SettingGroup><BackupResourceRestoreDialog v-model:open="restoreOpen" /></SettingPage></template>
