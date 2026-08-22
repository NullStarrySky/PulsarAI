<script setup lang="ts">
import { ref } from "vue";
import { host } from "@/host";
import { Check, ExternalLink, Sparkles } from "lucide-vue-next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import SettingPage from "@/features/Setting/components/SettingPage.vue";

const SUBSCRIPTION_URL = "https://www.youtube.com/watch?v=hvL1339luv0";

const plans = [
  {
    id: "starter",
    name: "启航版",
    description: "适合希望稳定使用核心功能的个人用户。",
    price: "¥18",
    featured: false,
    features: [
      "每月 1,000 次智能对话",
      "跨设备同步基础配置",
      "7 天会话历史版本",
      "社区支持",
    ],
    buttonLabel: "选择启航版",
  },
  {
    id: "pro",
    name: "星轨版",
    description: "为高频创作、研究和日常工作提供更充裕的空间。",
    price: "¥48",
    featured: true,
    features: [
      "每月 5,000 次智能对话",
      "更高并发与优先响应",
      "完整会话历史版本",
      "高级插件与自动化",
      "优先邮件支持",
    ],
    buttonLabel: "升级至星轨版",
  },
  {
    id: "studio",
    name: "远星版",
    description: "面向多人协作与需要集中管理资源的小型团队。",
    price: "¥98",
    featured: false,
    features: [
      "每月 15,000 次智能对话",
      "最多 5 位协作者",
      "共享角色、预设与知识资源",
      "团队用量与权限管理",
      "专属技术支持",
    ],
    buttonLabel: "选择远星版",
  },
] as const;

const openingPlanId = ref<string | null>(null);

async function openSubscription(planId: string) {
  openingPlanId.value = planId;
  try {
    await host.external.open(SUBSCRIPTION_URL);
  } finally {
    openingPlanId.value = null;
  }
}
</script>

<template>
  <SettingPage
    title="订阅方案"
    description="选择与你的使用方式相匹配的方案，随时可以更改或取消。"
  >
    <div class="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
      <Card
        v-for="plan in plans"
        :key="plan.id"
        class="relative flex min-w-0 flex-col overflow-hidden"
        :class="plan.featured && 'border-primary shadow-sm ring-1 ring-primary/20'"
      >
        <div v-if="plan.featured" class="h-1 bg-primary" />
        <CardHeader class="gap-4">
          <div class="flex min-h-6 items-center justify-between gap-3">
            <CardTitle class="text-lg">{{ plan.name }}</CardTitle>
            <Badge v-if="plan.featured" class="shrink-0 gap-1">
              <Sparkles class="size-3" />
              最受欢迎
            </Badge>
          </div>
          <CardDescription class="min-h-10 leading-5">
            {{ plan.description }}
          </CardDescription>
          <div class="flex items-end gap-1">
            <span class="text-3xl font-semibold tracking-tight">{{ plan.price }}</span>
            <span class="pb-1 text-sm text-muted-foreground">/ 月</span>
          </div>
        </CardHeader>

        <CardContent class="flex-1">
          <ul class="space-y-3 text-sm">
            <li
              v-for="feature in plan.features"
              :key="feature"
              class="flex items-start gap-2.5"
            >
              <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check class="size-3.5" />
              </span>
              <span class="leading-5">{{ feature }}</span>
            </li>
          </ul>
        </CardContent>

        <CardFooter>
          <Button
            class="h-10 w-full"
            :variant="plan.featured ? 'default' : 'outline'"
            :disabled="openingPlanId !== null"
            @click="openSubscription(plan.id)"
          >
            {{ openingPlanId === plan.id ? "正在前往订阅…" : plan.buttonLabel }}
            <ExternalLink v-if="openingPlanId !== plan.id" class="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>

    <p class="text-center text-xs leading-5 text-muted-foreground">
      所有方案均按月计费并自动续订。价格已包含适用税费，取消后权益保留至当前周期结束。
    </p>
  </SettingPage>
</template>
