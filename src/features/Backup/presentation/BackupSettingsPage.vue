<script setup lang="ts">
import { computed, onMounted } from "vue";
import { DatabaseBackup } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SettingGroup from "@/features/Setting/presentation/SettingGroup.vue";
import SettingItem from "@/features/Setting/presentation/SettingItem.vue";
import SettingPage from "@/features/Setting/presentation/SettingPage.vue";
import {
  backupIntervalOptions,
  backupLimitOptions,
  type BackupInterval,
  type BackupLimit,
  useBackupStore,
} from "../application/backup-store";

const backup = useBackupStore();
const backupOptions = computed(() => backup.backups.map((item) => ({ value: item.id, label: item.name })));

onMounted(() => {
  void backup.initialize();
});
</script>

<template>
  <SettingPage title="同步与备份" description="管理本地备份和远程备份参数。">
    <SettingGroup title="同步" description="账号同步、冲突策略和多端合并将在后续阶段接入。" />

    <SettingGroup title="本地备份">
      <SettingItem title="备份与恢复" :description="backup.status">
        <div class="grid w-full grid-cols-2 gap-2 sm:w-80">
          <Button @click="backup.createLocalBackup">
            <DatabaseBackup data-icon="inline-start" />
            立即备份
          </Button>
          <Button variant="outline" @click="backup.restoreLocalBackup">立即恢复</Button>
        </div>
      </SettingItem>
      <SettingItem title="备份文件" description="选择已有备份文件。">
        <div class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:w-80">
          <Select v-model="backup.local.selectedBackup">
            <SelectTrigger>
              <SelectValue placeholder="选择备份文件" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in backupOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button variant="destructive" @click="backup.deleteLocalBackup">删除</Button>
        </div>
      </SettingItem>
      <SettingItem title="备份目录" description="本地备份文件保存路径。">
        <div class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:w-80">
          <Input
            :model-value="backup.local.directory"
            placeholder="默认应用数据目录"
            @update:model-value="backup.updateLocal({ directory: String($event) })"
          />
          <Button variant="outline" @click="backup.selectDirectory">选择</Button>
        </div>
      </SettingItem>
      <SettingItem title="自动备份时长" description="间隔到期后生成本地备份。">
        <Select
          :model-value="backup.local.autoInterval"
          @update:model-value="backup.updateLocal({ autoInterval: String($event) as BackupInterval })"
        >
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in backupIntervalOptions" :key="item.value" :value="item.value">{{ item.label }}</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title="最大备份数量" description="超过限制后自动移除旧备份。">
        <Select
          :model-value="backup.local.maxBackups"
          @update:model-value="backup.updateLocal({ maxBackups: String($event) as BackupLimit })"
        >
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in backupLimitOptions" :key="item.value" :value="item.value">{{ item.label }}</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
    </SettingGroup>

    <SettingGroup title="远程备份">
      <SettingItem title="WebDAV 用户名">
        <Input class="w-full sm:w-80" v-model="backup.remote.username" @change="backup.persist" />
      </SettingItem>
      <SettingItem title="密码">
        <Input class="w-full sm:w-80" v-model="backup.remote.password" type="password" @change="backup.persist" />
      </SettingItem>
      <SettingItem title="地址">
        <Input class="w-full sm:w-80" v-model="backup.remote.address" placeholder="https://example.com/webdav" @change="backup.persist" />
      </SettingItem>
      <SettingItem title="路径">
        <Input class="w-full sm:w-80" v-model="backup.remote.path" placeholder="/PulsarAI" @change="backup.persist" />
      </SettingItem>
      <SettingItem title="备份与恢复" description="远程传输层后续接入。">
        <div class="grid w-full grid-cols-2 gap-2 sm:w-80">
          <Button @click="backup.createRemoteBackup">立即备份</Button>
          <Button variant="outline" @click="backup.restoreRemoteBackup">立即恢复</Button>
        </div>
      </SettingItem>
      <SettingItem title="备份文件" description="选择远程备份文件。">
        <div class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 sm:w-80">
          <Select v-model="backup.remote.selectedBackup">
            <SelectTrigger><SelectValue placeholder="暂无远程备份" /></SelectTrigger>
            <SelectContent />
          </Select>
          <Button variant="destructive" @click="backup.deleteRemoteBackup">删除</Button>
        </div>
      </SettingItem>
      <SettingItem title="自动备份时长">
        <Select
          :model-value="backup.remote.autoInterval"
          @update:model-value="backup.updateRemote({ autoInterval: String($event) as BackupInterval })"
        >
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in backupIntervalOptions" :key="item.value" :value="item.value">{{ item.label }}</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title="最大备份数量">
        <Select
          :model-value="backup.remote.maxBackups"
          @update:model-value="backup.updateRemote({ maxBackups: String($event) as BackupLimit })"
        >
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in backupLimitOptions" :key="item.value" :value="item.value">{{ item.label }}</SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
    </SettingGroup>
  </SettingPage>
</template>
