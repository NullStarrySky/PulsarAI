<script setup lang="ts">
import { computed, ref, watch, type HTMLAttributes } from 'vue';
import { ChevronLeft, ChevronRight } from '@/lib/remix-icons';

export interface GlideRollingNumberProps {
  /** 当前数值 (v-model) */
  modelValue?: number;
  /** 默认初始值 */
  defaultValue?: number;
  /** 总数（若传入，则默认渲染 < current / total > 分页模式） */
  total?: number;
  /** 最小值，默认 1 */
  min?: number;
  /** 最大值，若未传入则默认使用 total 或无上限 */
  max?: number;
  /** 变动步长，默认 1 */
  step?: number;
  /** 单个数字滚动过渡时长 (ms)，默认 280ms */
  duration?: number;
  /** 是否启用滚轮切换，默认 true */
  wheelEnabled?: boolean;
  /** 是否显示两侧 < > 切换箭头按钮，默认 true */
  showButtons?: boolean;
  /** 是否允许边界循环滚动，默认 false */
  loop?: boolean;
  /** 额外的样式类 */
  class?: HTMLAttributes['class'];
  className?: string;
}

const props = withDefaults(defineProps<GlideRollingNumberProps>(), {
  modelValue: undefined,
  defaultValue: 1,
  total: undefined,
  min: 1,
  max: undefined,
  step: 1,
  duration: 280,
  wheelEnabled: true,
  showButtons: true,
  loop: false,
  class: undefined,
  className: ''
});

const emit = defineEmits<{
  'update:modelValue': [val: number];
  'change': [val: number, direction: 'up' | 'down'];
}>();

// 内部数值响应式
const internalVal = ref<number>(
  props.modelValue !== undefined ? props.modelValue : props.defaultValue
);

watch(
  () => props.modelValue,
  (v) => {
    if (v !== undefined && v !== internalVal.value) {
      internalVal.value = v;
    }
  }
);

const effectiveMin = computed(() => props.min);
const effectiveMax = computed(() => props.max ?? (props.total !== undefined ? props.total : Infinity));

const canPrev = computed(() => {
  if (props.loop) return true;
  return internalVal.value > effectiveMin.value;
});

const canNext = computed(() => {
  if (props.loop) return true;
  return internalVal.value < effectiveMax.value;
});

// 设置新值
const setValue = (newVal: number, dir: 'up' | 'down') => {
  let target = newVal;
  if (props.loop && effectiveMax.value !== Infinity) {
    if (target < effectiveMin.value) target = effectiveMax.value;
    else if (target > effectiveMax.value) target = effectiveMin.value;
  } else {
    target = Math.max(effectiveMin.value, Math.min(effectiveMax.value, target));
  }

  if (target !== internalVal.value) {
    internalVal.value = target;
    emit('update:modelValue', target);
    emit('change', target, dir);
  }
};

const prev = () => {
  if (!canPrev.value) return;
  setValue(internalVal.value - props.step, 'down');
};

const next = () => {
  if (!canNext.value) return;
  setValue(internalVal.value + props.step, 'up');
};

// 滚轮节流
let lastWheelTime = 0;
const WHEEL_THRESHOLD_MS = 60;

const handleWheel = (e: WheelEvent) => {
  if (!props.wheelEnabled) return;
  const now = performance.now();
  if (now - lastWheelTime < WHEEL_THRESHOLD_MS) return;
  lastWheelTime = now;

  if (e.deltaY > 0) {
    next();
  } else if (e.deltaY < 0) {
    prev();
  }
};

// 将数字格式化为单个字符数组，便于独立列滚动
const currentChars = computed(() => String(internalVal.value).split(''));
const totalChars = computed(() =>
  props.total !== undefined ? String(props.total).split('') : []
);
</script>

<template>
  <div
    class="glide-rolling-number inline-flex items-center gap-1 font-mono text-xs tabular-nums select-none rounded-lg bg-muted/40 border border-border/50 px-2 py-1 shadow-2xs transition-colors hover:bg-muted/70"
    :class="[className, props.class]"
    @wheel.prevent="handleWheel"
  >
    <!-- 左切换按钮 < -->
    <button
      v-if="showButtons"
      type="button"
      :disabled="!canPrev"
      aria-label="Previous"
      class="p-0.5 rounded text-muted-foreground/80 hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      @click="prev"
    >
      <ChevronLeft class="size-3.5" />
    </button>

    <!-- 主展示区：包含每个独立数字的滚动槽 -->
    <div class="flex items-center tracking-tight font-medium text-foreground px-0.5">
      <!-- 当前数字每位独立滚动 -->
      <div class="inline-flex items-center">
        <template v-for="(char, idx) in currentChars" :key="`cur-${idx}`">
          <!-- 纯数字槽位：0..9 纵向滚轴 -->
          <span
            v-if="/^[0-9]$/.test(char)"
            class="glide-digit-viewport relative inline-block overflow-hidden h-[1.3em] w-[0.62em] align-middle"
          >
            <span
              class="glide-digit-reel absolute top-0 left-0 flex flex-col items-center justify-start w-full select-none"
              :style="{
                transform: `translate3d(0, -${Number(char) * 10}%, 0)`,
                transition: `transform ${duration}ms cubic-bezier(0.23, 1, 0.32, 1)`
              }"
            >
              <span
                v-for="d in 10"
                :key="d"
                class="h-[1.3em] leading-[1.3em] flex items-center justify-center font-bold"
              >
                {{ d - 1 }}
              </span>
            </span>
          </span>
          <!-- 非数字符号（负号、小数点等） -->
          <span v-else class="inline-block px-0.5 text-muted-foreground">
            {{ char }}
          </span>
        </template>
      </div>

      <!-- 分隔符 / (仅在有 total 时展示) -->
      <template v-if="total !== undefined">
        <span class="mx-1 text-muted-foreground/60 font-normal">/</span>

        <!-- 总数数字（支持静态或响应式展示） -->
        <div class="inline-flex items-center text-muted-foreground/90 font-normal">
          <template v-for="(char, idx) in totalChars" :key="`tot-${idx}`">
            <span
              v-if="/^[0-9]$/.test(char)"
              class="glide-digit-viewport relative inline-block overflow-hidden h-[1.3em] w-[0.62em] align-middle"
            >
              <span
                class="glide-digit-reel absolute top-0 left-0 flex flex-col items-center justify-start w-full select-none"
                :style="{
                  transform: `translate3d(0, -${Number(char) * 10}%, 0)`,
                  transition: `transform ${duration}ms cubic-bezier(0.23, 1, 0.32, 1)`
                }"
              >
                <span
                  v-for="d in 10"
                  :key="d"
                  class="h-[1.3em] leading-[1.3em] flex items-center justify-center"
                >
                  {{ d - 1 }}
                </span>
              </span>
            </span>
            <span v-else class="inline-block px-0.5">
              {{ char }}
            </span>
          </template>
        </div>
      </template>
    </div>

    <!-- 右切换按钮 > -->
    <button
      v-if="showButtons"
      type="button"
      :disabled="!canNext"
      aria-label="Next"
      class="p-0.5 rounded text-muted-foreground/80 hover:text-foreground hover:bg-accent/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      @click="next"
    >
      <ChevronRight class="size-3.5" />
    </button>
  </div>
</template>

<style scoped>
.glide-digit-viewport {
  contain: layout paint;
}
.glide-digit-reel {
  will-change: transform;
}
</style>
