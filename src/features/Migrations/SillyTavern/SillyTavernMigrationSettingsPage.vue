<script setup lang="ts">
import { computed, ref } from "vue";
import { open } from "@tauri-apps/plugin-dialog";
import { getActivePinia } from "pinia";
import { AlertCircle, CheckCircle2, FolderOpen, LoaderCircle, ScanSearch, Upload } from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SettingForm from "@/features/Setting/components/SettingForm.vue";
import SettingFormField from "@/features/Setting/components/SettingFormField.vue";
import SettingGroup from "@/features/Setting/components/SettingGroup.vue";
import SettingPage from "@/features/Setting/components/SettingPage.vue";
import { SillyTavernImporter, type SillyTavernMigrationPreview } from "./convert/sillytavern-importer";
import { tauriSillyTavernReaderTransport } from "./convert/tauri-migration-source";

const pinia = getActivePinia();
if (!pinia) throw new Error("SillyTavern migration requires an active Pinia instance.");
const importer = new SillyTavernImporter(pinia, tauriSillyTavernReaderTransport);
const sourcePath = ref("");
const preview = ref<SillyTavernMigrationPreview | null>(null);
const busy = ref(false);
const error = ref("");
const result = ref("");
const confirmOpen = ref(false);

const blockingConflictCount = computed(
  () => preview.value
    ? [...preview.value.plan.conflicts, ...preview.value.plan.diagnostics]
        .filter((item) => item.severity === "error").length
    : 0,
);
const warningCount = computed(
  () => preview.value?.plan.diagnostics.filter((item) => item.severity === "warning").length ?? 0,
);

async function chooseDirectory() {
  const selected = await open({ directory: true, multiple: false });
  if (typeof selected === "string") sourcePath.value = selected;
}

async function scan() {
  if (!sourcePath.value.trim()) return;
  busy.value = true;
  error.value = "";
  result.value = "";
  preview.value = null;
  try {
    preview.value = await importer.preview(sourcePath.value.trim());
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

async function commit() {
  if (!preview.value) return;
  busy.value = true;
  error.value = "";
  try {
    const committed = await importer.commit(preview.value.plan.id);
    result.value = `已导入 ${committed.packageIds.length} 个角色包、${committed.globalPluginIds.length} 个独立世界书插件和 ${committed.providerIds.length} 个连接。`;
    confirmOpen.value = false;
    preview.value = null;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <SettingPage title="数据迁移">
    <SettingGroup title="SillyTavern">
      <SettingForm>
        <SettingFormField
          title="数据路径"
          description="可选择 SillyTavern 根目录、data、data/default-user，或手工填写单个资源路径。扫描不会写入数据库。"
        >
          <div class="flex w-full flex-col gap-2 sm:flex-row">
            <Input v-model="sourcePath" class="min-w-0 flex-1" placeholder="选择或输入 SillyTavern 数据路径" />
            <Button variant="outline" size="icon" title="选择目录" @click="chooseDirectory">
              <FolderOpen class="size-4" />
            </Button>
            <Button :disabled="busy || !sourcePath.trim()" @click="scan">
              <LoaderCircle v-if="busy" class="mr-2 size-4 animate-spin" />
              <ScanSearch v-else class="mr-2 size-4" />
              扫描
            </Button>
          </div>
        </SettingFormField>
      </SettingForm>
    </SettingGroup>

    <div v-if="error" class="flex gap-3 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertCircle class="mt-0.5 size-4 shrink-0" />
      <span class="break-words">{{ error }}</span>
    </div>
    <div v-if="result" class="flex gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 class="mt-0.5 size-4 shrink-0" />
      <span>{{ result }}</span>
    </div>

    <SettingGroup v-if="preview" title="预解析结果">
      <div class="grid grid-cols-2 gap-3 py-2 sm:grid-cols-4">
        <div v-for="item in [
          ['角色包', preview.plan.counts.packages],
          ['会话', preview.plan.counts.conversations],
          ['本地世界书', preview.plan.counts.localWorldbooks],
          ['独立世界书', preview.plan.counts.globalWorldbooks],
          ['预设', preview.plan.counts.presets],
          ['背景', preview.plan.counts.backgrounds],
          ['连接', preview.plan.counts.providers],
          ['警告', warningCount],
        ]" :key="String(item[0])" class="rounded-xl bg-muted/45 px-3 py-2.5">
          <div class="text-xs text-muted-foreground">{{ item[0] }}</div>
          <div class="mt-1 text-lg font-semibold tabular-nums">{{ item[1] }}</div>
        </div>
      </div>

      <div class="divide-y">
        <details v-for="item in preview.plan.packages" :key="item.id" class="group py-3">
          <summary class="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
            <span class="min-w-0 truncate font-medium">{{ item.artifact.name }}</span>
            <span class="shrink-0 text-xs text-muted-foreground">
              {{ item.conversations.length }} 会话 · {{ item.claimedWorldbooks.length + item.artifact.embeddedLorebooks.length }} 世界书
            </span>
          </summary>
          <div class="mt-2 grid gap-1 text-xs leading-5 text-muted-foreground">
            <div>nickname：{{ item.artifact.nickname }}</div>
            <div>插件：{{ item.pluginId }}</div>
            <div v-if="item.artifact.boundWorldbookNames.length">绑定世界书：{{ item.artifact.boundWorldbookNames.join('、') }}</div>
            <div v-if="item.artifact.unconsumedFields.length">保留但未消费字段：{{ item.artifact.unconsumedFields.join('、') }}</div>
          </div>
        </details>
      </div>
    </SettingGroup>

    <SettingGroup v-if="preview && (preview.plan.conflicts.length || preview.plan.diagnostics.length)" title="诊断">
      <ScrollArea class="h-72">
        <div class="space-y-2 py-2 pr-3">
          <div
            v-for="(diagnostic, index) in [...preview.plan.conflicts, ...preview.plan.diagnostics]"
            :key="`${diagnostic.code}-${index}`"
            class="rounded-lg bg-muted/45 px-3 py-2 text-xs leading-5"
            :class="diagnostic.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'"
          >
            <div class="font-medium">{{ diagnostic.message }}</div>
            <div v-if="diagnostic.source" class="truncate opacity-75">{{ diagnostic.source.relativePath }}</div>
          </div>
        </div>
      </ScrollArea>
    </SettingGroup>

    <div v-if="preview" class="flex justify-end pb-2">
      <Button :disabled="busy || blockingConflictCount > 0" @click="confirmOpen = true">
        <Upload class="mr-2 size-4" />
        确认导入
      </Button>
    </div>

    <Dialog v-model:open="confirmOpen">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>提交 SillyTavern 迁移</DialogTitle>
          <DialogDescription>
            将按预览创建资源，不覆盖已有角色包、插件或连接。宏只保留诊断，等待后续动态宏迁移。
          </DialogDescription>
        </DialogHeader>
        <div v-if="preview" class="text-sm leading-6 text-muted-foreground">
          将创建 {{ preview.plan.counts.packages }} 个角色包和 {{ preview.plan.counts.conversations }} 个会话。
        </div>
        <DialogFooter>
          <Button variant="outline" @click="confirmOpen = false">取消</Button>
          <Button :disabled="busy" @click="commit">
            <LoaderCircle v-if="busy" class="mr-2 size-4 animate-spin" />
            导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </SettingPage>
</template>
