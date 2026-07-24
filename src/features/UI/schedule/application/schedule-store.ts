import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { push } from "notivue";
import { remove, selectAll, upsert } from "@/features/Database/application/database-service";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import {
  calculateNextRun,
  createScheduleTask,
  describeSchedule,
  describeTimeDistance,
  type ScheduleTask,
  type ScheduleWeekday,
} from "../domain/schedule";

const table = "ui_schedule_tasks";
let timer: number | null = null;

export const useScheduleStore = defineStore("schedule", () => {
  const loaded = ref(false);
  const tasks = ref<ScheduleTask[]>([]);
  const activeTaskId = ref("");
  const search = ref("");
  const filter = ref<"all" | "enabled" | "paused">("all");

  const activeTask = computed(() => tasks.value.find((task) => task.id === activeTaskId.value) ?? null);
  const filteredTasks = computed(() => {
    const keyword = search.value.trim().toLowerCase();
    return tasks.value
      .filter((task) => {
        if (filter.value === "enabled" && !task.enabled) {
          return false;
        }
        if (filter.value === "paused" && task.enabled) {
          return false;
        }
        return !keyword || task.title.toLowerCase().includes(keyword) || task.prompt.toLowerCase().includes(keyword);
      })
      .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt));
  });

  async function initialize() {
    if (loaded.value) {
      return;
    }

    const records = await selectAll<ScheduleTask>(table);
    tasks.value = records.map((record) => createScheduleTask(record.value));
    if (tasks.value.length === 0) {
      const seed = createScheduleTask({ title: "每日简报" });
      tasks.value = [seed];
      await persist(seed);
    }
    activeTaskId.value = tasks.value[0]?.id ?? "";
    loaded.value = true;
    startScheduler();
  }

  async function persist(task: ScheduleTask) {
    await upsert(table, task.id, task);
  }

  async function createTask(input: Partial<ScheduleTask> = {}) {
    const task = createScheduleTask(input);
    tasks.value.push(task);
    activeTaskId.value = task.id;
    await persist(task);
    return task;
  }

  async function updateTask(taskId: string, patch: Partial<ScheduleTask>) {
    const task = tasks.value.find((item) => item.id === taskId);
    if (!task) {
      return;
    }

    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    if (patch.period || patch.startTime || patch.endTime) {
      task.nextRunAt = calculateNextRun(task).toISOString();
    }
    await persist(task);
  }

  async function deleteTask(taskId: string) {
    tasks.value = tasks.value.filter((item) => item.id !== taskId);
    await remove(table, taskId);
    if (activeTaskId.value === taskId) {
      activeTaskId.value = tasks.value[0]?.id ?? "";
    }
  }

  async function setWeeklyDay(task: ScheduleTask, weekday: ScheduleWeekday, checked: boolean) {
    const current = task.period.type === "weekly" ? task.period.weekdays : [];
    const next = checked
      ? Array.from(new Set([...current, weekday])).sort()
      : current.filter((day) => day !== weekday);
    await updateTask(task.id, {
      period: { type: "weekly", weekdays: next as ScheduleWeekday[] },
    });
  }

  async function executeTask(taskId: string) {
    const task = tasks.value.find((item) => item.id === taskId);
    if (!task) {
      return;
    }
    if (!task.conversationId) {
      push.warning("请先为任务选择对话");
      return;
    }

    const conversation = useConversationStore();
    await conversation.initialize();
    conversation.openConversation(task.conversationId);
    await conversation.send(task.prompt);
    await updateTask(task.id, {
      lastRunAt: new Date().toISOString(),
      nextRunAt: calculateNextRun(task, new Date(Date.now() + 60000)).toISOString(),
    });
    push.success("定时任务已执行");
  }

  function startScheduler() {
    if (timer !== null) {
      return;
    }
    timer = window.setInterval(() => {
      const due = tasks.value.filter((task) => task.enabled && new Date(task.nextRunAt).getTime() <= Date.now());
      for (const task of due) {
        void executeTask(task.id);
      }
    }, 60000);
  }

  return {
    activeTask,
    activeTaskId,
    filter,
    filteredTasks,
    search,
    tasks,
    createTask,
    deleteTask,
    describeSchedule,
    describeTimeDistance,
    executeTask,
    initialize,
    setWeeklyDay,
    updateTask,
  };
});
