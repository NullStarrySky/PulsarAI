export type ScheduleWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SchedulePeriod =
  | { type: "daily" }
  | { type: "weekly"; weekdays: ScheduleWeekday[] };

export type ScheduleTask = {
  id: string;
  title: string;
  enabled: boolean;
  period: SchedulePeriod;
  startTime: string;
  endTime: string;
  prompt: string;
  conversationId: string;
  nextRunAt: string;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
};

export const WEEKDAY_OPTIONS: { id: ScheduleWeekday; label: string }[] = [
  { id: 1, label: "周一" },
  { id: 2, label: "周二" },
  { id: 3, label: "周三" },
  { id: 4, label: "周四" },
  { id: 5, label: "周五" },
  { id: 6, label: "周六" },
  { id: 7, label: "周日" },
];

function nowIso() {
  return new Date().toISOString();
}

export function createScheduleTask(input: Partial<ScheduleTask> = {}): ScheduleTask {
  const now = nowIso();
  const base: ScheduleTask = {
    id: input.id ?? crypto.randomUUID(),
    title: input.title?.trim() || "新的定时任务",
    enabled: input.enabled ?? true,
    period: input.period ?? { type: "daily" },
    startTime: input.startTime ?? "08:00",
    endTime: input.endTime ?? "09:00",
    prompt: input.prompt ?? "请根据这段对话做一次简短回顾，并提醒我下一步该关注什么。",
    conversationId: input.conversationId ?? "",
    nextRunAt: input.nextRunAt ?? "",
    lastRunAt: input.lastRunAt,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };

  if (!base.nextRunAt) {
    base.nextRunAt = calculateNextRun(base).toISOString();
  }

  return base;
}

export function describeSchedule(task: ScheduleTask) {
  const period =
    task.period.type === "daily"
      ? "每天"
      : task.period.weekdays
          .map((day) => WEEKDAY_OPTIONS.find((item) => item.id === day)?.label)
          .filter(Boolean)
          .join("、");
  const time = task.startTime === task.endTime ? task.startTime : `${task.startTime}-${task.endTime} 随机`;
  return `${period || "未选择周期"} ${time}`;
}

export function describeTimeDistance(iso: string) {
  const delta = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(delta)) {
    return "未安排";
  }
  if (delta <= 0) {
    return "即将执行";
  }

  const minutes = Math.ceil(delta / 60000);
  if (minutes < 60) {
    return `${minutes} 分钟后`;
  }
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) {
    return `${hours} 小时后`;
  }
  return `${Math.ceil(hours / 24)} 天后`;
}

export function calculateNextRun(task: Pick<ScheduleTask, "period" | "startTime" | "endTime">, from = new Date()) {
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(from);
    date.setDate(from.getDate() + offset);
    const weekday = jsDayToScheduleWeekday(date.getDay());
    const allowed = task.period.type === "daily" || task.period.weekdays.includes(weekday);
    if (!allowed) {
      continue;
    }

    const next = randomTimeInRange(date, task.startTime, task.endTime);
    if (next.getTime() > from.getTime()) {
      return next;
    }
  }

  const fallback = new Date(from);
  fallback.setDate(fallback.getDate() + 1);
  return randomTimeInRange(fallback, task.startTime, task.endTime);
}

function jsDayToScheduleWeekday(day: number): ScheduleWeekday {
  return (day === 0 ? 7 : day) as ScheduleWeekday;
}

function randomTimeInRange(date: Date, startTime: string, endTime: string) {
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  const minute = min + Math.floor(Math.random() * (max - min + 1));
  const result = new Date(date);
  result.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return result;
}

function parseTime(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}
