---
title: Host API
description: Renderer 使用的跨平台数据库、原生能力与桌面/移动命名空间
---

# Host API

Host 是 Renderer Feature 与原生平台之间唯一稳定 facade：

```ts
import { host } from "@/host";
```

Feature 不直接导入 Electron、Tauri 或 Tauri plugin。Host API 也不进入普通 Plugin Sandbox。

## 顶层结构

```ts
interface Host {
  target: "desktop-electron" | "mobile-tauri";
  database: HostDatabase;
  plugins: HostPluginStorage;
  config: HostConfig;
  secrets: HostSecrets;
  dialog: HostDialog;
  platform: HostPlatform;
  notifications: HostNotifications;
  external: { open(url: string): Promise<void> };
  backup: { invoke<T>(command: string, payload?: object): Promise<T> };
  migration: { invoke<T>(command: string, payload: { path: string }): Promise<T> };
  network: HostNetwork;
  local: HostLocalMedia;
  speech: { invoke<T>(command: string, payload?: object): Promise<T> };
  webSocket: typeof WebSocket;
  desktop?: HostDesktop;
  mobile?: HostMobile;
}
```

调用平台专属 API 前应按 `host.target` 或共享响应式平台状态收窄命名空间。不存在的平台能力保持 `undefined`，不提供无效 no-op。

## 数据库

```ts
interface DatabaseRecord<T> {
  id: string | null;
  value: T;
}

interface HostDatabase {
  selectAll<T>(table: string): Promise<Array<DatabaseRecord<T>>>;
  selectByField<T>(
    table: string,
    field: "packageId" | "conversationid",
    value: string,
  ): Promise<Array<DatabaseRecord<T>>>;
  selectOne<T>(table: string, id: string): Promise<T | null>;
  upsert<T>(table: string, id: string, value: T): Promise<void>;
  remove(table: string, id: string): Promise<void>;
  resetCharacterData(): Promise<void>;
}
```

数据库实现由平台 Host 负责。Feature repository 应继续封装表名和领域对象，不把裸 Host 查询散落到组件。

## Plugin 存储

```ts
interface HostPluginStorage {
  load<T>(): Promise<T[]>;
  save<T>(plugin: T): Promise<void>;
  remove(pluginId: string): Promise<void>;
  search<T>(query: string, limit?: number): Promise<T[]>;
}
```

Plugin 使用独立存储接口，以便原生端维护内容索引；Renderer 的事实模型仍是 `Plugin.files + emptyFolders`。

## 配置与 Secret

```ts
interface HostConfig {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

interface HostSecrets {
  has(name: string): Promise<boolean>;
  set(name: string, value: string): Promise<void>;
  clearValue(name: string): Promise<void>;
  remove(name: string): Promise<void>;
}
```

前端状态只保存 Secret 占位符或是否存在，不读取原始密钥。需要密钥的网络与模型请求由 Host 代理注入。

## 对话框、平台与通知

```ts
interface HostDialog {
  open(options: Record<string, unknown>): Promise<string | string[] | null>;
  save(options: Record<string, unknown>): Promise<string | null>;
}

interface HostPlatform {
  platform(): string;
  osType(): string;
  arch(): string;
  family(): string;
  version(): string;
  isMobile: boolean;
}

interface HostNotifications {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<"granted" | "denied">;
  send(input: { title: string; body: string }): Promise<void>;
}
```

外部链接优先使用 `host.external.open()`；桌面环境也提供 `host.desktop.openExternal()`，但共享 Feature 不应依赖桌面命名空间。

## 网络与本地媒体

```ts
interface HostNetwork {
  webSearch<T>(request: unknown): Promise<T>;
  modelProxyFetch<T>(request: unknown): Promise<T>;
}

interface HostLocalMedia {
  invoke<T>(
    area: "tts" | "stt",
    command: string,
    payload?: Record<string, unknown>,
  ): Promise<T>;
}
```

WebSearch 和模型代理使用有边界的请求结构。TTS/STT Feature 拥有媒体服务语义，Host 只承载必须位于原生端的执行或密钥注入。

## Desktop Electron

```ts
interface HostDesktop {
  window: {
    minimize(): Promise<void>;
    toggleMaximize(): Promise<void>;
    close(): Promise<void>;
    hide(): Promise<void>;
    startDragging(): Promise<void>;
  };
  openExternal(url: string): Promise<void>;
  executeEnvironmentCommand(name: string): Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>;
  subWindow: {
    create(input: {
      label: string;
      url: string;
      title?: string;
      width?: number;
      height?: number;
      hidden?: boolean;
    }): Promise<void>;
    send(label: string, event: string, payload: unknown): Promise<void>;
    listen(event: string, listener: (payload: unknown) => void): () => void;
    close(label: string): Promise<void>;
  };
}
```

Electron 拥有无边框主窗口尺寸、拖拽区、托盘/关闭生命周期、子窗口、桌面环境检查与 Playwright。Renderer 不会得到 `ipcRenderer`、Node 或任意命令执行。

## Mobile Tauri

```ts
interface HostMobile {
  battery: {
    getStatus(): Promise<{
      available: boolean;
      isOptimized: boolean;
      isIgnoringOptimizations: boolean;
    }>;
    requestExemption(): Promise<void>;
    openSettings(): Promise<void>;
  };
  navigationBar: {
    setColor(color: "light" | "dark"): Promise<boolean>;
  };
  speechRecognition: {
    isAvailable(): Promise<boolean>;
  };
  stt: {
    invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T>;
  };
}
```

移动端不注册托盘、桌面窗口生命周期、多窗口、Playwright 或桌面设置。系统 STT 只使用移动系统引擎，不暴露桌面 whisper/GGML 路径。
