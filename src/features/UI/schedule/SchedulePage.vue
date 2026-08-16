<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import {
  CalendarClock,
  MoreHorizontal,
  PauseCircle,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { WEEKDAY_OPTIONS, type ScheduleTask, type ScheduleWeekday } from "./schedule";
import { useScheduleStore } from "./schedule-store";
import ConversationSelector from "./ConversationSelector.vue";

const schedule = useScheduleStore();
const editorOpen = ref(false);
const editingTaskId = ref("");

const editingTask = computed(() => schedule.tasks.find((task) => task.id === editingTaskId.value) ?? null);

onMounted(() => {
  void schedule.initialize();
});

watch(
  () => schedule.activeTaskId,
  (id) => {
    if (!editingTaskId.value && id) {
      editingTaskId.value = id;
    }
  },
);

async function createTask() {
  const task = await schedule.createTask();
  openEditor(task.id);
}

function openEditor(taskId: string) {
  schedule.activeTaskId = taskId;
  editingTaskId.value = taskId;
  editorOpen.value = true;
}

async function toggleWeeklyDay(task: ScheduleTask, day: ScheduleWeekday, checked: boolean) {
  await schedule.setWeeklyDay(task, day, checked);
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background px-8 py-7 mobile:px-4 mobile:py-5">
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-7 mobile:gap-5">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold tracking-normal mobile:text-2xl">已安排的任务</h1>
          <p class="mt-2 text-sm text-muted-foreground">安排周期任务、提醒和对话内自动提示。</p>
        </div>
        <Button size="icon" title="新建任务" @click="createTask">
          <Plus class="size-4" />
        </Button>
      </header>

      <div class="relative">
        <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input v-model="schedule.search" class="h-10 rounded-full pl-9" placeholder="搜索已安排任务" />
      </div>

      <Tabs v-model="schedule.filter">
        <TabsList class="w-fit mobile:w-full">
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="enabled">已开启</TabsTrigger>
          <TabsTrigger value="paused">已暂停</TabsTrigger>
        </TabsList>
      </Tabs>

      <section class="grid gap-2">
        <div
          v-for="task in schedule.filteredTasks"
          :key="task.id"
          :class="
            cn(
              'group grid min-h-20 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent/45 mobile:grid-cols-[minmax(0,1fr)_auto] mobile:px-3',
              !task.enabled && 'opacity-65',
            )
          "
          role="button"
          @click="openEditor(task.id)"
        >
          <span :class="cn('size-4 rounded-full border mobile:hidden', task.enabled && 'border-primary bg-primary/15')" />
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold">{{ task.title }}</div>
            <div class="mt-1 truncate text-xs text-muted-foreground">
              {{ schedule.describeSchedule(task) }} · 下次运行 {{ schedule.describeTimeDistance(task.nextRunAt) }}
            </div>
          </div>
          <div class="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              class="size-8"
              :title="task.enabled ? '暂停' : '开启'"
              @click.stop="schedule.updateTask(task.id, { enabled: !task.enabled })"
            >
              <PauseCircle v-if="task.enabled" class="size-4" />
              <Play v-else class="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button size="icon" variant="ghost" class="size-8" title="任务菜单" @click.stop>
                  <MoreHorizontal class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-36">
                <DropdownMenuItem @click="schedule.executeTask(task.id)">
                  <Play class="mr-2 size-4" />
                  立即运行
                </DropdownMenuItem>
                <DropdownMenuItem @click="schedule.updateTask(task.id, { enabled: !task.enabled })">
                  <PauseCircle class="mr-2 size-4" />
                  {{ task.enabled ? "暂停" : "开启" }}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem class="text-destructive focus:text-destructive" @click="schedule.deleteTask(task.id)">
                  <Trash2 class="mr-2 size-4" />
                  删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div v-if="schedule.filteredTasks.length === 0" class="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          没有匹配的任务。
        </div>
      </section>

      <section class="grid gap-4 border-t pt-5">
        <h2 class="text-sm font-medium text-muted-foreground">建议</h2>
        <div class="grid gap-5">
          <div class="flex gap-3">
            <CalendarClock class="mt-0.5 size-4 text-primary" />
            <div>
              <div class="text-sm font-medium">每周回顾</div>
              <p class="text-sm text-muted-foreground">每周五把最近的对话整理成简明的状态更新。</p>
            </div>
          </div>
          <div class="flex gap-3">
            <Search class="mt-0.5 size-4 text-emerald-500" />
            <div>
              <div class="text-sm font-medium">跟进监控</div>
              <p class="text-sm text-muted-foreground">查看近期对话并标记需要你关注的事项。</p>
            </div>
          </div>
        </div>
      </section>
    </div>

    <Dialog v-model:open="editorOpen">
      <DialogContent class="max-h-[86vh] overflow-y-auto sm:max-w-2xl">
        <template v-if="editingTask">
          <DialogHeader>
            <DialogTitle>编辑定时任务</DialogTitle>
          </DialogHeader>

          <div class="grid gap-5">
            <label class="grid gap-2 text-sm">
              <span class="font-medium">标题</span>
              <Input
                :model-value="editingTask.title"
                @update:model-value="schedule.updateTask(editingTask.id, { title: String($event) })"
              />
            </label>

            <div class="grid gap-2 text-sm">
              <span class="font-medium">周期</span>
              <div class="flex gap-2">
                <Button
                  size="sm"
                  :variant="editingTask.period.type === 'daily' ? 'default' : 'outline'"
                  @click="schedule.updateTask(editingTask.id, { period: { type: 'daily' } })"
                >
                  每天
                </Button>
                <Button
                  size="sm"
                  :variant="editingTask.period.type === 'weekly' ? 'default' : 'outline'"
                  @click="schedule.updateTask(editingTask.id, { period: { type: 'weekly', weekdays: [1] } })"
                >
                  每周
                </Button>
              </div>
              <div v-if="editingTask.period.type === 'weekly'" class="grid grid-cols-7 gap-2 mobile:grid-cols-4">
                <label
                  v-for="day in WEEKDAY_OPTIONS"
                  :key="day.id"
                  class="flex items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs"
                >
                  <Checkbox
                    :model-value="editingTask.period.weekdays.includes(day.id)"
                    @update:model-value="toggleWeeklyDay(editingTask, day.id, Boolean($event))"
                  />
                  {{ day.label }}
                </label>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3 text-sm mobile:grid-cols-1">
              <label class="grid gap-2">
                <span class="font-medium">开始时间</span>
                <Input
                  type="time"
                  :model-value="editingTask.startTime"
                  @update:model-value="schedule.updateTask(editingTask.id, { startTime: String($event) })"
                />
              </label>
              <label class="grid gap-2">
                <span class="font-medium">结束时间</span>
                <Input
                  type="time"
                  :model-value="editingTask.endTime"
                  @update:model-value="schedule.updateTask(editingTask.id, { endTime: String($event) })"
                />
              </label>
            </div>

            <label class="grid gap-2 text-sm">
              <span class="font-medium">对话</span>
              <ConversationSelector
                :model-value="editingTask.conversationId"
                @update:model-value="schedule.updateTask(editingTask.id, { conversationId: $event })"
              />
            </label>

            <label class="grid gap-2 text-sm">
              <span class="font-medium">提示词</span>
              <Textarea
                :model-value="editingTask.prompt"
                class="min-h-36 resize-y"
                @update:model-value="schedule.updateTask(editingTask.id, { prompt: String($event) })"
              />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" @click="editorOpen = false">完成</Button>
            <Button @click="schedule.executeTask(editingTask.id)">立即运行</Button>
          </DialogFooter>
        </template>
      </DialogContent>
    </Dialog>
  </div>
</template>
