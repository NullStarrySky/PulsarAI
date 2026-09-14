<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
	Button,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/fluid";
import { Input } from "@/components/ui/input";
import { useSyncStore } from "@/features/Database/dbsync-store";
import SettingGroup from "@/features/Environment/setting/SettingGroup.vue";
import SettingItem from "@/features/Environment/setting/SettingItem.vue";
import SettingPage from "@/features/Environment/setting/SettingPage.vue";
import {
	ArchiveRestore,
	DatabaseBackup,
	Download,
	ShieldCheck,
	Upload,
} from "@/lib/phosphor-icons";
import BackupResourceRestoreDialog from "./BackupResourceRestoreDialog.vue";
import { useBackupStore } from "./backup-store";

const backup = useBackupStore();
const sync = useSyncStore();
const restoreOpen = ref(false);
const selected = ref("");
const choices = computed(() =>
	[...sync.characters].map((item) => ({
		value: `local-plugin:${item.id}`,
		label: item.name,
	})),
);

onMounted(async () => {
	await Promise.all([backup.initialize(), sync.init()]);
});

async function exportSelected() {
	if (selected.value) await backup.exportResource(selected.value);
}
</script>

<template>
  <SettingPage title="版本管理" description="本地 Plugin、其 World 与会话可作为同一资源恢复或导出。">
    <p v-if="backup.status" class="rounded border p-3 text-sm">{{ backup.status }}</p>
    <SettingGroup title="资源导入与导出">
      <SettingItem title="导出本地 Plugin" description="导出为含 manifest.json 的文件夹压缩包；导入也接受解压后的文件夹。">
        <div class="flex gap-2">
          <Select v-model="selected"><SelectTrigger><SelectValue placeholder="选择本地 Plugin" /></SelectTrigger><SelectContent><SelectItem v-for="item in choices" :key="item.value" :value="item.value">{{ item.label }}</SelectItem></SelectContent></Select>
          <Button :disabled="!selected" @click="exportSelected"><Download />导出</Button>
          <Button @click="backup.importResourceArchive('update')"><Upload />导入</Button>
        </div>
      </SettingItem>
    </SettingGroup>
    <SettingGroup title="本地历史备份">
      <SettingItem title="创建备份" description="创建当前数据库的历史快照。"><Button @click="backup.createLocalBackup"><DatabaseBackup />立即备份</Button></SettingItem>
      <SettingItem title="历史版本" description="选择后可恢复全部数据库或具体本地 Plugin。">
        <div class="flex gap-2">
          <Select v-model="backup.local.selectedBackup"><SelectTrigger><SelectValue placeholder="选择备份" /></SelectTrigger><SelectContent><SelectItem v-for="item in backup.backups" :key="item.id" :value="item.id">{{ item.name }}</SelectItem></SelectContent></Select>
          <Button variant="outline" :disabled="!backup.local.selectedBackup" @click="backup.loadBackupResources().then((ok) => restoreOpen = ok)"><ArchiveRestore />恢复资源</Button>
          <Button variant="outline" :disabled="!backup.local.selectedBackup" @click="backup.restoreLocalBackup"><ShieldCheck />全量恢复</Button>
        </div>
      </SettingItem>
      <SettingItem title="备份目录"><Input :model-value="backup.local.directory" @update:model-value="backup.updateLocal({ directory: String($event) })" /></SettingItem>
    </SettingGroup>
    <BackupResourceRestoreDialog v-model:open="restoreOpen" />
  </SettingPage>
</template>
