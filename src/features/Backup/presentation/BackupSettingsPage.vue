<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import {
  ArchiveRestore,
  DatabaseBackup,
  RefreshCw,
  ShieldCheck,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
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
import BackupResourceRestoreDialog from "./BackupResourceRestoreDialog.vue";

const backup = useBackupStore();
const conversation = useConversationStore();
const restoreDialogOpen = ref(false);
const backupOptions = computed(() =>
  backup.backups.map((item) => ({ value: item.id, label: item.name })),
);
const syncHistory = computed(() =>
  Object.entries(backup.lastSyncByDevice).sort((a, b) => b[1].localeCompare(a[1])),
);

onMounted(async () => {
  await Promise.all([backup.initialize(), conversation.initialize()]);
});

async function openResourceRestore() {
  if (await backup.loadBackupResources()) {
    restoreDialogOpen.value = true;
  }
}

function formatSyncTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
</script>

<template>
  <SettingPage title="版本管理" description="在设备间合并资源，并从历史备份恢复所需内容。">
    <div
      v-if="backup.status"
      class="rounded-lg border bg-muted/35 px-4 py-3 text-sm"
      aria-live="polite"
    >
      {{ backup.status }}
    </div>

    <SettingGroup
      title="局域网同步"
      description="使用配对密钥连接同一局域网中的 Pulsar 设备。同步优先复制缺失资源，并保留并发版本。"
    >
      <SettingItem
        title="允许其他设备连接"
        :description="backup.serverRunning ? `正在监听端口 ${backup.lan.port}` : '同步服务未启动'"
      >
        <Switch
          :model-value="backup.serverRunning"
          @update:model-value="backup.toggleLanServer(Boolean($event))"
        />
      </SettingItem>
      <SettingItem title="设备名称" description="对端会通过这个名称识别当前设备。">
        <Input
          class="w-full sm:w-80"
          :model-value="backup.lan.deviceName"
          @update:model-value="backup.updateLan({ deviceName: String($event) })"
          @change="backup.serverRunning && backup.publishSnapshot()"
        />
      </SettingItem>
      <SettingItem title="监听端口" description="更改端口后需要重新启动同步服务。">
        <Input
          class="w-full sm:w-80"
          type="number"
          min="1024"
          max="65535"
          :model-value="backup.lan.port"
          @update:model-value="backup.updateLan({ port: Number($event) || 17321 })"
        />
      </SettingItem>
      <SettingItem title="配对密钥" description="两台设备必须填写相同的密钥，至少 6 个字符。">
        <Input
          class="w-full sm:w-80"
          :model-value="backup.lan.pairingKey"
          @update:model-value="backup.updateLan({ pairingKey: String($event) })"
        />
      </SettingItem>
      <SettingItem title="对端地址" description="填写对端设备的局域网地址与监听端口。">
        <div class="grid w-full gap-2 sm:w-80 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            :model-value="backup.lan.peerAddress"
            placeholder="http://192.168.1.20:17321"
            @update:model-value="backup.updateLan({ peerAddress: String($event) })"
          />
          <Button :disabled="backup.syncing" @click="backup.syncWithPeer">
            <RefreshCw :class="{ 'animate-spin': backup.syncing }" />
            {{ backup.syncing ? "同步中" : "立即同步" }}
          </Button>
        </div>
      </SettingItem>
      <SettingItem
        title="同步范围"
        description="关闭的角色包及其会话和本地插件不会出现在同步快照中。"
      >
        <div class="grid w-full gap-2 sm:w-80">
          <label
            v-for="item in conversation.packages"
            :key="item.id"
            class="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span class="truncate">{{ item.name }}</span>
            <Switch
              size="sm"
              :model-value="item.syncEnabled !== false"
              @update:model-value="backup.setPackageSyncEnabled(item.id, Boolean($event))"
            />
          </label>
        </div>
      </SettingItem>
      <SettingItem
        v-if="syncHistory.length"
        title="最近同步"
        description="按对端设备标识记录最近一次成功合并时间。"
      >
        <div class="grid w-full gap-2 sm:w-80">
          <div
            v-for="[deviceId, value] in syncHistory"
            :key="deviceId"
            class="flex items-center justify-between gap-3 text-sm"
          >
            <span class="truncate font-mono text-xs text-muted-foreground">
              {{ deviceId.slice(0, 8) }}
            </span>
            <span>{{ formatSyncTime(value) }}</span>
          </div>
        </div>
      </SettingItem>
    </SettingGroup>

    <SettingGroup title="本地历史备份">
      <SettingItem title="创建备份" description="保存当前数据库的完整历史版本。">
        <Button @click="backup.createLocalBackup">
          <DatabaseBackup data-icon="inline-start" />
          立即备份
        </Button>
      </SettingItem>
      <SettingItem title="历史版本" description="选择一个备份后，可以恢复特定资源或执行全量恢复。">
        <div class="grid w-full gap-2 sm:w-80">
          <Select v-model="backup.local.selectedBackup">
            <SelectTrigger>
              <SelectValue placeholder="选择历史备份" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="item in backupOptions" :key="item.value" :value="item.value">
                {{ item.label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <div class="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              :disabled="!backup.local.selectedBackup || backup.loadingResources"
              @click="openResourceRestore"
            >
              <ArchiveRestore />
              恢复资源
            </Button>
            <Button
              variant="outline"
              :disabled="!backup.local.selectedBackup"
              @click="backup.restoreLocalBackup"
            >
              <ShieldCheck />
              全量恢复
            </Button>
          </div>
          <Button
            variant="destructive"
            :disabled="!backup.local.selectedBackup"
            @click="backup.deleteLocalBackup"
          >
            删除所选备份
          </Button>
        </div>
      </SettingItem>
      <SettingItem title="备份目录" description="本地历史备份的保存路径。">
        <div class="grid w-full gap-2 sm:w-80 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            :model-value="backup.local.directory"
            placeholder="默认应用数据目录"
            @update:model-value="backup.updateLocal({ directory: String($event) })"
          />
          <Button variant="outline" @click="backup.selectDirectory">选择</Button>
        </div>
      </SettingItem>
      <SettingItem title="自动备份" description="按固定间隔生成本地历史版本。">
        <Select
          :model-value="backup.local.autoInterval"
          @update:model-value="backup.updateLocal({ autoInterval: String($event) as BackupInterval })"
        >
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in backupIntervalOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
      <SettingItem title="保留数量" description="超过限制后自动移除最旧的历史备份。">
        <Select
          :model-value="backup.local.maxBackups"
          @update:model-value="backup.updateLocal({ maxBackups: String($event) as BackupLimit })"
        >
          <SelectTrigger class="w-full sm:w-80"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in backupLimitOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </SettingItem>
    </SettingGroup>

    <SettingGroup
      title="WebDAV 备份"
      description="保留现有远程备份配置。传输层尚未启用，不参与局域网同步。"
    >
      <SettingItem title="用户名">
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
    </SettingGroup>

    <BackupResourceRestoreDialog v-model:open="restoreDialogOpen" />
  </SettingPage>
</template>
