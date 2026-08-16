<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Loader2, Mic, Square } from "lucide-vue-next";
import { push } from "notivue";
import { Button } from "@/components/ui/button";
import { useDefaultConfigStore } from "@/features/defaultConfigs/default-config-store";
import { generateText } from "@/features/ModelConnection/services/model-ai";
import { transcribe } from "./speech-to-text";
import { WebAudioRecorder } from "./providers/audio-recorder";
import {
  getSystemSttAvailability,
  getSystemSttPermission,
  onSystemSttError,
  onSystemSttResult,
  requestSystemSttPermission,
  startSystemStt,
  stopSystemStt,
  supportsSystemStt,
} from "./system-speech-to-text";

const emit = defineEmits<{
  (e: "result", text: string): void;
}>();

const defaults = useDefaultConfigStore();
const systemSupported = supportsSystemStt();

const status = ref<"idle" | "recording" | "transcribing" | "polishing">("idle");
const elapsedSeconds = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;

const recorder = new WebAudioRecorder();
const nativeTranscript = ref("");

let removeResultListener: (() => void) | undefined;
let removeErrorListener: (() => void) | undefined;

const formattedTime = computed(() => {
  const m = Math.floor(elapsedSeconds.value / 60)
    .toString()
    .padStart(2, "0");
  const s = (elapsedSeconds.value % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
});

function handleGlobalToggle() {
  void toggleRecording();
}

onMounted(() => {
  window.addEventListener("pulsar:stt-toggle", handleGlobalToggle);
});

onBeforeUnmount(() => {
  window.removeEventListener("pulsar:stt-toggle", handleGlobalToggle);
  cleanup();
});

function cleanup() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  removeResultListener?.();
  removeErrorListener?.();
  removeResultListener = undefined;
  removeErrorListener = undefined;
}

async function toggleRecording() {
  if (status.value === "recording") {
    await stopAndProcess();
  } else if (status.value === "idle") {
    await startRecording();
  }
}

let startTime = 0;

async function startRecording() {
  cleanup();
  await defaults.load();
  elapsedSeconds.value = 0;
  nativeTranscript.value = "";

  if (systemSupported) {
    try {
      const availability = await getSystemSttAvailability();
      if (!availability.available) throw new Error(availability.reason || "系统语音识别不可用");
      const permission = await getSystemSttPermission();
      if (permission.microphone !== "granted" || permission.speechRecognition !== "granted") {
        const req = await requestSystemSttPermission();
        if (req.microphone !== "granted" || req.speechRecognition !== "granted") {
          throw new Error("语音识别权限未授予");
        }
      }
      removeResultListener = await onSystemSttResult((res) => {
        nativeTranscript.value = res.transcript;
        if (res.isFinal) {
          void processResultText(res.transcript);
        }
      });
      removeErrorListener = await onSystemSttError((err) => {
        push.error(`系统语音识别错误: ${err.message}`);
        status.value = "idle";
        cleanup();
      });
      await startSystemStt({
        language: defaults.sttLanguage !== "auto" ? defaults.sttLanguage : undefined,
        maxDuration: 60_000,
        onDevice: true,
      });
    } catch (error) {
      push.error(error instanceof Error ? error.message : "启动系统语音识别失败");
      return;
    }
  } else {
    try {
      await recorder.start();
    } catch (error) {
      push.error(error instanceof Error ? error.message : "无法开启麦克风");
      return;
    }
  }

  status.value = "recording";
  startTime = Date.now();
  timer = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - startTime) / 1000);
  }, 200);
}

async function stopAndProcess() {
  cleanup();

  if (systemSupported) {
    try {
      await stopSystemStt();
    } catch {
      // ignore
    }
    if (nativeTranscript.value.trim()) {
      await processResultText(nativeTranscript.value);
    } else {
      status.value = "idle";
    }
    return;
  }

  status.value = "transcribing";
  try {
    const audioData = await recorder.stop();
    if (!audioData || audioData.length === 0) {
      push.warning("未采集到有效的语音信号");
      status.value = "idle";
      return;
    }

    const res = await transcribe({
      audio: audioData,
      ...(defaults.sttLanguage !== "auto" ? { language: defaults.sttLanguage } : {}),
    });

    await processResultText(res.text);
  } catch (error) {
    push.error(error instanceof Error ? error.message : "语音识别失败");
    status.value = "idle";
  }
}

async function processResultText(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    status.value = "idle";
    return;
  }

  let finalResult = trimmed;

  if (defaults.sttAutoPolish) {
    status.value = "polishing";
    try {
      const polishModel = defaults.sttPolishModel || defaults.fastModel || defaults.defaultChatModel;
      const promptTemplate = defaults.sttPolishPrompt || "你是一个语音识别文本润色助手。请对以下语音识别出来的文本进行润色，修正错别字、口语停顿和标点符号，保持原意，直接输出润色后的文本，不要输出任何多余的解释。文本：\n{{text}}";
      const prompt = promptTemplate.replace("{{text}}", trimmed);

      const response = await generateText({
        model: polishModel,
        prompt,
      });

      if (response.text.trim()) {
        finalResult = response.text.trim();
      }
    } catch (error) {
      push.error("润色失败，使用原始转写文本");
    }
  }

  emit("result", finalResult);
  status.value = "idle";
}

defineExpose({
  toggleRecording,
});
</script>

<template>
  <div class="inline-flex items-center">
    <div
      v-if="status !== 'idle'"
      class="flex cursor-pointer items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs text-destructive animate-in fade-in zoom-in-95 duration-200 hover:bg-destructive/15"
      @click="status === 'recording' && toggleRecording()"
    >
      <Button
        size="icon-sm"
        variant="ghost"
        class="size-5 rounded-full p-0 hover:bg-destructive/20"
        :disabled="status !== 'recording'"
        title="结束录制"
      >
        <Square v-if="status === 'recording'" class="size-3 fill-current text-destructive" />
        <Loader2 v-else class="size-3 animate-spin text-destructive" />
      </Button>

      <span v-if="status === 'recording'" class="font-mono font-medium tabular-nums select-none">
        {{ formattedTime }}
      </span>
      <span v-else-if="status === 'transcribing'" class="font-medium select-none">
        转写中…
      </span>
      <span v-else-if="status === 'polishing'" class="font-medium select-none">
        润色中…
      </span>
    </div>

    <Button
      v-else
      size="icon-sm"
      variant="ghost"
      class="rounded-full hover:bg-muted"
      title="语音输入 (Alt+V)"
      @click="toggleRecording"
    >
      <Mic class="size-4 text-muted-foreground transition-colors hover:text-foreground" />
    </Button>
  </div>
</template>
