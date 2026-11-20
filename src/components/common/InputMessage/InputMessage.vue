<script setup lang="ts">
import {
  animate,
  motionValue,
  useReducedMotion,
  type AnimationPlaybackControls
} from 'motion-v';
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type Component,
  type CSSProperties
} from 'vue';
import {
  Attachment,
  Calendar,
  Check,
  ChevronDown,
  FileText,
  Globe,
  HelpCircle,
  LineChart,
  Mail,
  Mic,
  Plus,
  Sparkles,
  X as CloseIcon
} from '@/lib/remix-icons';

export interface PromptBarSource {
  key: string;
  name: string;
  description?: string;
  icon?: Component;
  attach?: boolean;
}

export interface PromptBarCommand {
  key: string;
  name: string;
  description?: string;
}

export interface PromptBarModel {
  key: string;
  name: string;
  tag?: string;
}

export interface PromptBarSendDetail {
  attachments: string[];
  model?: PromptBarModel;
  effort?: string;
}

type AttachResult = string | string[] | void | Promise<string | string[] | void>;
type DictateResult = string | void | Promise<string | void>;

interface PromptBarProps {
  modelValue?: string;
  placeholder?: string;
  sendLabel?: string;
  sources?: PromptBarSource[];
  commands?: PromptBarCommand[];
  models?: PromptBarModel[];
  defaultModel?: string;
  efforts?: string[];
  defaultEffort?: string;
  busy?: boolean;
  onAttach?: () => AttachResult;
  onDictate?: () => DictateResult;
  background?: string;
  color?: string;
  menuBackground?: string;
  sparkColor?: string;
  sparkBoost?: number;
  width?: number | string;
  radius?: number;
  maxRows?: number;
  morphDuration?: number;
  squash?: number;
  tilt?: number;
  pressScale?: number;
  className?: string;
}

type Row = {
  key: string;
  name: string;
  description?: string;
  tag?: string;
  icon?: Component;
  attach?: boolean;
};
type Token = { kind: 'at' | 'slash'; query: string; start: number };

const ARROW_UP = [12, 4.5, 18.5, 11, 14.25, 11, 14.25, 19.5, 9.75, 19.5, 9.75, 11, 5.5, 11];
const SQUARE = [12, 6, 18, 6, 18, 12, 18, 18, 6, 18, 6, 12, 6, 6];
const EASE_IN_OUT: [number, number, number, number] = [0.77, 0, 0.175, 1];
const LINE = 22;

const DEFAULT_SOURCES: PromptBarSource[] = [
  {
    key: 'files',
    name: 'Photos & files',
    description: 'Upload from this device',
    icon: Attachment,
    attach: true
  },
  { key: 'web', name: 'Web search', description: 'Live results', icon: Globe },
  { key: 'sales', name: 'Sales data', description: 'Revenue and churn', icon: LineChart },
  { key: 'docs', name: 'Documents', description: 'Specs, notes, briefs', icon: FileText },
  { key: 'mail', name: 'Mail', description: 'Read and draft mail', icon: Mail },
  { key: 'calendar', name: 'Calendar', description: 'Events and availability', icon: Calendar }
];

const DEFAULT_COMMANDS: PromptBarCommand[] = [
  { key: 'summarize', name: '/summarize', description: 'Digest the thread so far' },
  { key: 'compare', name: '/compare', description: 'Two options side by side' },
  { key: 'draft', name: '/draft', description: 'Write a first version' },
  { key: 'explain', name: '/explain', description: 'A plain-language walkthrough' },
  { key: 'tasks', name: '/tasks', description: 'Turn this into a to-do list' }
];

const DEFAULT_MODELS: PromptBarModel[] = [
  { key: 'default', name: 'Default Model', tag: 'Active' },
  { key: 'fast', name: 'Fast Mode', tag: 'Fast' }
];
const DEFAULT_EFFORTS = ['Low', 'Medium', 'High', 'Extra', 'Max'];

const TOOL_BTN =
  'inline-flex h-7 flex-none cursor-pointer touch-manipulation items-center gap-1 rounded-lg border-0 bg-transparent px-2 text-[12px] font-medium outline-none select-none [color:color-mix(in_srgb,var(--pb-ink)_70%,transparent)] [font:inherit] [-webkit-tap-highlight-color:transparent] [transition:background-color_150ms_ease,color_150ms_ease] data-[on]:[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] data-[on]:[color:var(--pb-ink)] [@media(hover:hover)_and_(pointer:fine)]:hover:[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] [@media(hover:hover)_and_(pointer:fine)]:hover:[color:var(--pb-ink)] data-[max]:[color:var(--pb-spark)]!';
const ICON_BTN =
  'inline-grid h-7 w-7 flex-none cursor-pointer touch-manipulation place-items-center rounded-lg border-0 bg-transparent p-0 outline-none select-none [color:color-mix(in_srgb,var(--pb-ink)_60%,transparent)] [font:inherit] [-webkit-tap-highlight-color:transparent] [transition:background-color_150ms_ease,color_150ms_ease,transform_160ms_cubic-bezier(0.23,1,0.32,1)] active:[transform:scale(0.94)] data-[on]:[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] data-[on]:[color:var(--pb-ink)] motion-reduce:active:[transform:none] [@media(hover:hover)_and_(pointer:fine)]:hover:[background:color-mix(in_srgb,var(--pb-ink)_8%,transparent)] [@media(hover:hover)_and_(pointer:fine)]:hover:[color:var(--pb-ink)]';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const pathAt = (a: number[], b: number[], t: number) => {
  let d = '';
  for (let i = 0; i < a.length; i += 2) {
    d += `${i ? 'L' : 'M'}${mix(a[i]!, b[i]!, t).toFixed(2)} ${mix(a[i + 1]!, b[i + 1]!, t).toFixed(2)}`;
  }
  return `${d}Z`;
};

const parseToken = (text: string): Token | null => {
  const m = /(^|\s)([@/])([\w-]*)$/.exec(text);
  if (!m) return null;
  return { kind: m[2] === '@' ? 'at' : 'slash', query: m[3]!.toLowerCase(), start: m.index + m[1]!.length };
};

const props = withDefaults(defineProps<PromptBarProps>(), {
  modelValue: '',
  placeholder: '输入消息…',
  sendLabel: '发送',
  sources: undefined,
  commands: undefined,
  models: undefined,
  defaultModel: '',
  efforts: undefined,
  defaultEffort: '',
  busy: false,
  onAttach: undefined,
  onDictate: undefined,
  background: 'var(--card)',
  color: 'var(--foreground)',
  menuBackground: 'var(--popover)',
  sparkColor: 'var(--primary)',
  sparkBoost: 1,
  width: undefined,
  radius: 16,
  maxRows: 6,
  morphDuration: 240,
  squash: 0.12,
  tilt: 8,
  pressScale: 0.96,
  className: ''
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'send': [text: string, detail: PromptBarSendDetail];
  'stop': [];
  'effortChange': [effort: string];
}>();

const sourceList = computed(() => props.sources ?? DEFAULT_SOURCES);
const commandList = computed(() => props.commands ?? DEFAULT_COMMANDS);
const modelList = computed(() => props.models ?? DEFAULT_MODELS);
const effortList = computed(() => props.efforts ?? DEFAULT_EFFORTS);

const reduce = useReducedMotion();
const rootRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);
const glowRef = ref<HTMLSpanElement | null>(null);
const sparkRef = ref<HTMLCanvasElement | null>(null);
const sendSvg = ref<SVGSVGElement | null>(null);
const sendPath = ref<SVGPathElement | null>(null);
let dictation = 0;

defineExpose({
  el: rootRef,
  input: inputRef,
  glow: glowRef,
  spark: sparkRef,
  sendSvg,
  sendPath
});

const draft = ref(props.modelValue ?? '');
watch(() => props.modelValue, (val) => {
  if (val !== undefined && val !== draft.value) {
    draft.value = val;
    nextTick(resize);
  }
});

watch(draft, (val) => {
  emit('update:modelValue', val);
});

const attachments = ref<string[]>([]);
const modelKey = ref(props.defaultModel);
const plusOpen = ref(false);
const modelOpen = ref(false);
const effortOpen = ref(false);
const effortIndex = ref(
  (() => {
    const i = effortList.value.indexOf(props.defaultEffort);
    return i >= 0 ? i : Math.max(0, Math.floor((effortList.value.length - 1) / 2));
  })()
);
const dismissed = ref(false);
const active = ref(0);
const listening = ref(false);

const model = computed(() => modelList.value.find(m => m.key === modelKey.value) ?? modelList.value[0]);
const token = computed(() => (dismissed.value ? null : parseToken(draft.value)));

const open = computed<'plus' | 'model' | 'effort' | 'at' | 'slash' | null>(() => {
  if (plusOpen.value) return 'plus';
  if (modelOpen.value) return 'model';
  if (effortOpen.value) return 'effort';
  return token.value ? token.value.kind : null;
});

const query = computed(() => token.value?.query ?? '');
const list = computed<Row[]>(() => {
  if (open.value === 'plus' || open.value === 'at') {
    const q = query.value;
    return sourceList.value
      .filter(s => !q || s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q)))
      .map(s => ({ ...s }));
  }
  if (open.value === 'slash') {
    const q = query.value;
    return commandList.value
      .filter(c => !q || c.name.toLowerCase().includes(q) || (c.description && c.description.toLowerCase().includes(q)))
      .map(c => ({ ...c }));
  }
  if (open.value === 'model') {
    return modelList.value.map(m => ({ ...m }));
  }
  return [];
});

const cursor = computed(() => {
  const n = list.value.length;
  if (n === 0) return -1;
  return Math.min(Math.max(0, active.value), n - 1);
});

const level = computed(() => effortList.value[effortIndex.value] ?? '');
const maxed = computed(() => effortIndex.value === effortList.value.length - 1);
const canSend = computed(() => draft.value.trim().length > 0 || attachments.value.length > 0);
const armed = computed(() => canSend.value || props.busy);
const hasDictate = computed(() => typeof props.onDictate === 'function');

const menuLabel = computed(() => {
  if (open.value === 'effort') return 'Effort level';
  if (open.value === 'model') return 'Select model';
  if (open.value === 'slash') return 'Commands';
  return 'Sources and files';
});

const barStyle = computed<CSSProperties>(() => ({
  '--pb-bg': props.background,
  '--pb-ink': props.color,
  '--pb-menu': props.menuBackground,
  '--pb-spark': props.sparkColor,
  '--pb-radius': `${props.radius}px`,
  '--pb-tilt': `${props.tilt}deg`,
  '--pb-press': String(props.pressScale),
  width: typeof props.width === 'number' ? `${props.width}px` : props.width ?? '100%',
  maxWidth: '100%'
}));

const morph = motionValue(props.busy ? 1 : 0);
let morphAnim: AnimationPlaybackControls | null = null;
watch(
  () => props.busy,
  isBusy => {
    morphAnim?.stop();
    if (reduce.value) {
      morph.set(isBusy ? 1 : 0);
      return;
    }
    morphAnim = animate(morph, isBusy ? 1 : 0, {
      duration: props.morphDuration / 1000,
      ease: EASE_IN_OUT
    });
  }
);

let unwatchMorph: (() => void) | null = null;
onMounted(() => {
  unwatchMorph = morph.on('change', t => {
    if (sendPath.value) {
      sendPath.value.setAttribute('d', pathAt(ARROW_UP, SQUARE, t));
    }
  });
  if (sendPath.value) {
    sendPath.value.setAttribute('d', pathAt(ARROW_UP, SQUARE, morph.get()));
  }
});
onUnmounted(() => {
  unwatchMorph?.();
  morphAnim?.stop();
});

const resize = () => {
  const el = inputRef.value;
  if (!el) return;
  el.style.height = 'auto';
  const max = props.maxRows * LINE;
  el.style.height = `${Math.min(el.scrollHeight, max)}px`;
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
};

const focusInput = () => inputRef.value?.focus();

const closeMenus = () => {
  plusOpen.value = false;
  modelOpen.value = false;
  effortOpen.value = false;
};

const toggleSources = () => {
  const next = !plusOpen.value;
  closeMenus();
  plusOpen.value = next;
  active.value = 0;
};

const toggleModels = () => {
  const next = !modelOpen.value;
  closeMenus();
  modelOpen.value = next;
  active.value = 0;
};

const toggleEffort = () => {
  const next = !effortOpen.value;
  closeMenus();
  effortOpen.value = next;
};

const toggleListen = async () => {
  if (!props.onDictate) return;
  if (listening.value) {
    listening.value = false;
    return;
  }
  listening.value = true;
  const runId = ++dictation;
  try {
    const text = await props.onDictate();
    if (runId !== dictation || !listening.value) return;
    if (text) {
      draft.value = draft.value ? `${draft.value} ${text}` : text;
      nextTick(() => {
        resize();
        focusInput();
      });
    }
  } finally {
    if (runId === dictation) listening.value = false;
  }
};

const runAttach = async () => {
  if (!props.onAttach) return;
  const res = await props.onAttach();
  if (!res) return;
  const files = Array.isArray(res) ? res : [res];
  attachments.value = [...attachments.value, ...files];
};

const pick = async (row: Row) => {
  if (open.value === 'model') {
    modelKey.value = row.key;
    closeMenus();
    focusInput();
    return;
  }
  if (row.attach) {
    closeMenus();
    await runAttach();
    focusInput();
    return;
  }
  const tok = token.value;
  if (tok) {
    const before = draft.value.slice(0, tok.start);
    const after = draft.value.slice(tok.start + tok.query.length + 1);
    const insert = `${row.name} `;
    draft.value = `${before}${insert}${after}`;
    nextTick(() => {
      const el = inputRef.value;
      if (el) {
        const atPos = before.length + insert.length;
        el.setSelectionRange(atPos, atPos);
      }
      resize();
      focusInput();
    });
  } else {
    closeMenus();
    focusInput();
  }
};

const send = () => {
  if (!canSend.value || props.busy) return;
  const textToSend = draft.value.trim();
  emit('send', textToSend, {
    attachments: attachments.value,
    model: model.value,
    effort: level.value
  });
  draft.value = '';
  attachments.value = [];
  nextTick(() => {
    resize();
    focusInput();
  });
};

const onSendClick = () => {
  if (props.busy) {
    emit('stop');
  } else {
    send();
  }
};

const onInput = (e: Event) => {
  draft.value = (e.target as HTMLTextAreaElement).value;
  dismissed.value = false;
  active.value = 0;
  resize();
};

const onKeyDown = (e: KeyboardEvent) => {
  if (open.value && open.value !== 'effort') {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active.value = (active.value + 1) % Math.max(1, list.value.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      active.value = (active.value - 1 + list.value.length) % Math.max(1, list.value.length);
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const item = list.value[cursor.value];
      if (item) {
        e.preventDefault();
        pick(item);
        return;
      }
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      dismissed.value = true;
      closeMenus();
      return;
    }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    send();
  }
};
</script>

<template>
  <div
    ref="rootRef"
    class="relative isolate text-inherit select-none"
    :class="className"
    :style="barStyle"
  >
    <!-- Menu popup -->
    <div
      v-if="open"
      class="bottom-[calc(100%+8px)] left-0 z-30 absolute flex flex-col gap-0.5 shadow-xl p-1.5 [background:var(--pb-menu)] rounded-xl w-full max-h-[280px] overflow-y-auto"
      :role="open === 'effort' ? 'dialog' : 'listbox'"
      :aria-label="menuLabel"
      @click.stop
    >
      <template v-if="open === 'effort'">
        <div class="flex items-center gap-2 px-2 py-1 text-xs">
          <span class="text-muted-foreground">思考深度</span>
          <span class="font-medium text-foreground">{{ level }}</span>
          <span class="inline-flex ml-auto text-muted-foreground" title="更高的思考深度将在回答前进行更多思考">
            <HelpCircle class="size-3.5" />
          </span>
        </div>
        <div class="flex justify-between px-2 text-[10px] text-muted-foreground">
          <span>更快</span>
          <span>更聪明</span>
        </div>
        <div class="flex items-center gap-1.5 p-2">
          <button
            v-for="(name, idx) in effortList"
            :key="name"
            type="button"
            class="flex-1 py-1 rounded text-center text-xs transition-colors"
            :class="idx === effortIndex ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'"
            @click="effortIndex = idx; emit('effortChange', name)"
          >
            {{ name }}
          </button>
        </div>
      </template>

      <template v-else>
        <button
          v-for="(row, i) in list"
          :key="row.key"
          type="button"
          role="option"
          :aria-selected="i === cursor"
          class="relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg w-full text-left cursor-pointer transition-colors"
          :class="i === cursor ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'"
          @click="pick(row)"
          @pointerenter="active = i"
        >
          <component :is="row.icon" v-if="row.icon" class="size-4 shrink-0 text-muted-foreground" />
          <span class="text-xs font-medium">{{ row.name }}</span>
          <span v-if="row.description" class="text-[11px] text-muted-foreground truncate flex-1">
            {{ row.description }}
          </span>
          <template v-if="open === 'model'">
            <span class="ml-auto text-[10px] text-muted-foreground">{{ row.tag }}</span>
            <Check v-if="row.key === model?.key" class="size-3.5 text-primary ml-1 shrink-0" />
          </template>
        </button>

        <div v-if="list.length === 0" class="flex items-center px-3 py-2 text-xs text-muted-foreground">
          无匹配项
        </div>
      </template>
    </div>

    <!-- Main Composer Box -->
    <div
      class="relative flex flex-col gap-2 p-3 rounded-2xl border border-border/80 bg-card shadow-sm cursor-text transition-all duration-200 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10"
      @click="focusInput"
    >
      <!-- Attachments pill row -->
      <div v-if="attachments.length > 0" class="flex flex-wrap gap-1.5">
        <span
          v-for="(file, i) in attachments"
          :key="`${file}-${i}`"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-muted text-xs text-foreground"
        >
          <FileText class="size-3 text-muted-foreground" />
          <span class="max-w-[140px] truncate text-xs">{{ file }}</span>
          <button
            type="button"
            class="size-4 grid place-items-center rounded hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors"
            :aria-label="`移除 ${file}`"
            @click.stop="attachments = attachments.filter((_, j) => j !== i)"
          >
            <CloseIcon class="size-2.5" />
          </button>
        </span>
      </div>

      <!-- Textarea -->
      <textarea
        ref="inputRef"
        v-model="draft"
        class="block w-full bg-transparent p-0 text-sm placeholder:text-muted-foreground/60 border-0 outline-none resize-none leading-relaxed overflow-hidden"
        rows="1"
        :placeholder="listening ? '正在听取…' : placeholder"
        aria-label="消息输入"
        @input="onInput"
        @focus="closeMenus"
        @keydown="onKeyDown"
      />

      <!-- Toolbar Row -->
      <div class="flex items-center gap-1.5 pt-1">
        <button
          type="button"
          :class="ICON_BTN"
          aria-label="添加附件或来源"
          :data-on="plusOpen ? '' : undefined"
          @mousedown.prevent
          @click="toggleSources"
        >
          <Plus class="size-4" />
        </button>

        <button
          v-if="modelList.length > 0"
          type="button"
          :class="TOOL_BTN"
          aria-label="选择模型"
          :data-on="modelOpen ? '' : undefined"
          @mousedown.prevent
          @click="toggleModels"
        >
          <span>{{ model.name }}</span>
          <ChevronDown class="size-3" />
        </button>

        <button
          v-if="effortList.length > 0"
          type="button"
          :class="TOOL_BTN"
          aria-label="选择思考深度"
          :data-on="effortOpen ? '' : undefined"
          :data-max="maxed ? '' : undefined"
          @mousedown.prevent
          @click="toggleEffort"
        >
          <Sparkles class="size-3" />
          <span>{{ level }}</span>
        </button>

        <span class="flex-auto" />

        <button
          v-if="hasDictate"
          type="button"
          :class="ICON_BTN"
          :aria-label="listening ? '停止录音' : '语音输入'"
          :data-on="listening ? '' : undefined"
          @mousedown.prevent
          @click="toggleListen"
        >
          <Mic class="size-3.5" :class="listening ? 'text-primary animate-pulse' : ''" />
        </button>

        <!-- Send / Stop button with morphing SVG -->
        <button
          type="button"
          class="inline-grid relative flex-none place-items-center size-8 rounded-lg outline-none cursor-pointer transition-all duration-150 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          :class="armed ? 'bg-primary text-primary-foreground shadow-sm hover:opacity-90' : 'bg-muted text-muted-foreground'"
          :disabled="!armed"
          :aria-label="busy ? '停止' : sendLabel"
          @mousedown.prevent
          @click="onSendClick"
        >
          <svg
            ref="sendSvg"
            viewBox="0 0 24 24"
            class="size-4"
            fill="currentColor"
          >
            <path
              ref="sendPath"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>
