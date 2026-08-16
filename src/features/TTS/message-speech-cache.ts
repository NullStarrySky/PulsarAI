import { getSpeechModel } from "@/features/defaultConfigs/default-config-service";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import {
  findPluginNodeByPath,
  type PluginFile,
  type PluginFolder,
} from "@/features/Plugin/tree/plugin-types";
import {
  createPluginMediaContent,
  pluginMediaSource,
} from "@/features/Plugin/editors/media/plugin-media";
import { generateSpeech } from "./text-to-speech";
import { PIPER_TTS_PROVIDER_ID } from "./providers/piper-tts-client";

let playing: HTMLAudioElement | null = null;

function base64(bytes: Uint8Array) {
  let result = "";
  const block = 0x8000;
  for (let index = 0; index < bytes.length; index += block) {
    result += String.fromCharCode(...bytes.subarray(index, index + block));
  }
  return btoa(result);
}

async function cacheKey(messageId: string, text: string, model: string, voice: string) {
  const input = new TextEncoder().encode([messageId, text, model, voice].join("\u0000"));
  const hash = await crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function tempFolder(pluginId: string, root: PluginFolder) {
  const store = usePluginStore();
  const existing = findPluginNodeByPath(root, "temp");
  if (existing?.kind === "folder") return existing;
  return store.createFolder(pluginId, root.id, "temp");
}

function cachedFile(root: PluginFolder, filename: string) {
  const node = findPluginNodeByPath(root, `temp/${filename}`);
  return node?.kind === "file" ? node : null;
}

async function startPlayback(source: string) {
  playing?.pause();
  playing = new Audio(source);
  playing.onended = () => {
    if (playing?.src === source) playing = null;
  };
  await playing.play();
}

/**
 * Caches generated audio under the active package Plugin's conventional temp/
 * folder. The cache key contains the concrete message text, so an edited message
 * naturally cannot reuse a stale recording.
 */
export async function playMessageSpeech(messageId: string, text: string, voice = "") {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("没有可朗读的内容。");

  const conversation = useConversationStore();
  const pluginStore = usePluginStore();
  const packagePlugin = pluginStore.sortedPlugins.find(
    (plugin) => plugin.id === conversation.activePackage?.pluginId,
  );
  if (!packagePlugin) throw new Error("当前角色包没有可写入 temp/ 的资源插件。");

  const model = String(await getSpeechModel() ?? "default");
  const extension = model.startsWith(`${PIPER_TTS_PROVIDER_ID}/`) ? "wav" : "mp3";
  const filename = `tts-${await cacheKey(messageId, trimmed, model, voice)}.${extension}`;
  const hit = cachedFile(packagePlugin.root, filename);
  const source = hit ? pluginMediaSource(hit.content) : "";
  if (source) {
    await startPlayback(source);
    return { cached: true };
  }

  const result = await generateSpeech({ text: trimmed, ...(voice ? { voice } : {}) });
  const bytes = result.audio.uint8Array;
  const mediaType = result.audio.mediaType || "audio/mpeg";
  const folder = await tempFolder(packagePlugin.id, packagePlugin.root);
  if (!folder) throw new Error("无法创建 temp/ 缓存目录。");
  const content = createPluginMediaContent(`data:${mediaType};base64,${base64(bytes)}`);
  const file = await pluginStore.createFile(packagePlugin.id, folder.id, {
    name: filename,
    content,
  }) as PluginFile | null;
  const generatedSource = pluginMediaSource(file?.content ?? content);
  if (!generatedSource) throw new Error("生成的音频缓存无效。");
  await startPlayback(generatedSource);
  return { cached: false };
}

export function stopMessageSpeech() {
  playing?.pause();
  playing = null;
}
