import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from "electron";
import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase } from "./database.mjs";
import { hydrateSecretPlaceholders, secretPreview } from "./secret-utils.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const applicationIcon = path.join(directory, "icons", process.platform === "win32" ? "icon.ico" : "icon.png");
const windows = new Map();
let mainWindow;
let database;

const windowOptions = {
  width: 970,
  height: 600,
  minWidth: 320,
  minHeight: 480,
  frame: false,
  center: true,
  backgroundColor: "#0b0d10",
  icon: applicationIcon,
  webPreferences: {
    preload: path.join(directory, "preload.cjs"),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
  },
};

app.setName("PulsarAI");
if (process.platform === "win32") app.setAppUserModelId("PulsarAI");

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required.`);
  return value;
}

function senderWindow(event) {
  return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

function sendTo(label, event, payload) {
  const target = label === "main" ? mainWindow : windows.get(label);
  if (!target || target.isDestroyed()) throw new Error(`Window '${label}' is unavailable.`);
  target.webContents.send(`pulsar:host:event:${event}`, payload);
}

async function modelProxyFetch(request) {
  const input = request && typeof request === "object" ? request : {};
  const url = new URL(requiredString(input.url, "request.url"));
  if (!/^https?:$/.test(url.protocol)) throw new Error("Only HTTP(S) proxy requests are allowed.");
  const headers = new Headers();
  for (const header of Array.isArray(input.headers) ? input.headers : []) {
    headers.set(header.name, await hydrateSecretPlaceholders(
      String(header.value ?? ""),
      (name) => database.selectOne("host_secrets", name),
    ));
  }
  let body = Array.isArray(input.body) ? Uint8Array.from(input.body) : undefined;
  if (body) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
      body = new TextEncoder().encode(await hydrateSecretPlaceholders(
        text,
        (name) => database.selectOne("host_secrets", name),
      ));
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
  }
  let response;
  try {
    response = await fetch(url, {
      method: typeof input.method === "string" ? input.method : "GET",
      headers,
      body,
    });
  } catch (error) {
    const detail = error?.cause instanceof Error ? error.cause.message : error instanceof Error ? error.message : String(error);
    throw new Error(`模型请求失败：${detail}`);
  }
  return {
    status: response.status,
    headers: [...response.headers.entries()].map(([name, value]) => ({ name, value })),
    body: [...new Uint8Array(await response.arrayBuffer())],
  };
}

async function exaWebSearch(request) {
  if (request?.provider === "playwright") {
    throw new Error("Playwright 桌面搜索将在 Electron 主进程浏览器服务接入后启用。");
  }
  const apiKey = await database.selectOne("host_secrets", "webSearch.exa.apiKey");
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("请先在网络搜索设置中填写 Exa API Key。");
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({ query: requiredString(request?.query, "query"), type: "auto", numResults: Math.min(Math.max(Number(request?.limit) || 5, 1), 10), contents: { highlights: true } }),
  });
  if (!response.ok) throw new Error(`Exa 搜索请求失败：${response.status}`);
  const body = await response.json();
  return Array.isArray(body.results) ? body.results
    .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
    .map((item) => ({ title: item.title, url: item.url, snippet: item.highlights?.[0] ?? item.summary ?? item.text ?? "" })) : [];
}

async function scanMigrationPath(input) {
  const root = await stat(input);
  const collect = async (rootPath, filePath) => {
    const metadata = await stat(filePath);
    return {
      path: filePath,
      relativePath: path.relative(rootPath, filePath).replaceAll("\\", "/"),
      name: path.basename(filePath),
      extension: path.extname(filePath).slice(1).toLowerCase(),
      size: metadata.size,
      modifiedAt: metadata.mtimeMs,
    };
  };
  if (root.isFile()) {
    const parent = path.dirname(input);
    return { rootPath: parent, isFile: true, entries: [await collect(parent, input)] };
  }
  const entries = [];
  const pending = [input];
  while (pending.length) {
    const directoryPath = pending.pop();
    for (const child of await readdir(directoryPath, { withFileTypes: true })) {
      const childPath = path.join(directoryPath, child.name);
      if (child.isSymbolicLink()) continue;
      if (child.isDirectory()) pending.push(childPath);
      else if (child.isFile()) entries.push(await collect(input, childPath));
      if (entries.length > 100000) throw new Error("扫描文件超过上限 100000，请缩小导入目录。");
    }
  }
  entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return { rootPath: input, isFile: false, entries };
}

async function migration(method, payload) {
  const filePath = requiredString(payload?.path, "path");
  if (method === "scan") return scanMigrationPath(filePath);
  const bytes = await readFile(filePath);
  if (bytes.length > 64 * 1024 * 1024) throw new Error("文件过大，限制为 64 MiB。");
  if (method === "readText") return bytes.toString("utf8");
  if (method === "readBinary") return { mediaType: "application/octet-stream", base64: bytes.toString("base64") };
  if (method === "readPngCharacter") throw new Error("Electron PNG 角色卡读取将在迁移解析器移植时启用。");
  throw new Error(`Unsupported migration operation: ${method}`);
}

function executeEnvironmentCommand(name) {
  const commands = {
    "node-version": ["node", ["--version"]],
    "git-version": ["git", ["--version"]],
    "node-path-windows": ["where", ["node"]],
    "git-path-windows": ["where", ["git"]],
    "node-path-unix": ["which", ["node"]],
    "git-path-unix": ["which", ["git"]],
  };
  const selected = commands[name];
  if (!selected) throw new Error("Unsupported environment command.");
  return new Promise((resolve, reject) => {
    const child = spawn(selected[0], selected[1], { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function handleHostInvoke(event, namespace, method, payload = {}) {
  if (namespace === "database") {
    if (method === "selectAll") return database.selectAll(payload.table);
    if (method === "selectByField") return database.selectByField(payload.table, payload.field, payload.value);
    if (method === "selectOne") return database.selectOne(payload.table, payload.id);
    if (method === "upsert") return database.upsert(payload.table, payload.id, payload.value);
    if (method === "remove") return database.remove(payload.table, payload.id);
    if (method === "resetCharacterData") return database.resetCharacterData();
  }
  if (namespace === "plugins") {
    if (method === "load") return database.loadPlugins();
    if (method === "save") return database.savePlugin(payload.plugin);
    if (method === "remove") return database.deletePlugin(payload.pluginId);
    if (method === "search") return database.searchPluginNodes(payload.query, payload.limit);
  }
  if (namespace === "config") {
    if (method === "get") return database.selectOne("config", payload.key);
    if (method === "set") return database.upsert("config", payload.key, payload.value);
    if (method === "remove") return database.remove("config", payload.key);
  }
  if (namespace === "secrets") {
    if (method === "has") return Boolean(await database.selectOne("host_secrets", payload.name));
    if (method === "preview") return secretPreview(await database.selectOne("host_secrets", payload.name));
    if (method === "set") return database.upsert("host_secrets", payload.name, payload.value);
    if (method === "clearValue") return database.upsert("host_secrets", payload.name, "");
    if (method === "remove") return database.remove("host_secrets", payload.name);
  }
  if (namespace === "window") {
    const target = senderWindow(event);
    if (method === "minimize") return target?.minimize();
    if (method === "toggleMaximize") return target?.isMaximized() ? target.unmaximize() : target?.maximize();
    if (method === "close") return target?.close();
    if (method === "hide") return target?.hide();
  }
  if (namespace === "desktop") {
    if (method === "openExternal") return shell.openExternal(requiredString(payload.url, "url"));
    if (method === "executeEnvironmentCommand") return executeEnvironmentCommand(payload.name);
  }
  if (namespace === "dialog") {
    const target = senderWindow(event);
    if (method === "open") { const result = await dialog.showOpenDialog(target, payload.options); return result.canceled ? null : payload.options?.multiple ? result.filePaths : result.filePaths[0] ?? null; }
    if (method === "save") { const result = await dialog.showSaveDialog(target, payload.options); return result.canceled ? null : result.filePath ?? null; }
  }
  if (namespace === "subWindow") {
    if (method === "create") {
      const label = requiredString(payload.label, "label");
      const parent = mainWindow;
      const child = new BrowserWindow({ ...windowOptions, width: payload.width ?? 980, height: payload.height ?? 720, title: payload.title ?? "PulsarAI", parent, show: !payload.hidden });
      windows.set(label, child);
      child.on("closed", () => windows.delete(label));
      child.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: "deny" }; });
      const url = new URL(requiredString(payload.url, "url"), parent.webContents.getURL()).toString();
      if (rendererUrl) await child.loadURL(url); else await child.loadFile(path.join(directory, "..", "..", "dist", "index.html"), { query: { subwindow: new URL(url).searchParams.get("subwindow") ?? "" } });
      return;
    }
    if (method === "send") return sendTo(payload.label, payload.event, payload.payload);
    if (method === "close") return windows.get(payload.label)?.close();
  }
  if (namespace === "network") {
    if (method === "modelProxyFetch") return modelProxyFetch(payload.request);
    if (method === "webSearch") return exaWebSearch(payload.request);
  }
  if (namespace === "notifications" && method === "send") {
    if (Notification.isSupported()) new Notification({ title: requiredString(payload.title, "title"), body: String(payload.body ?? "") }).show();
    return;
  }
  if (namespace === "migration") return migration(method, payload);
  throw new Error(`Unsupported host operation: ${namespace}.${method}`);
}

async function createMainWindow() {
  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: "deny" }; });
  if (rendererUrl) await mainWindow.loadURL(rendererUrl);
  else await mainWindow.loadFile(path.join(directory, "..", "..", "dist", "index.html"));
}

app.whenReady().then(async () => {
  database = await createDatabase(app.getPath("userData"));
  ipcMain.handle("pulsar:host:invoke", handleHostInvoke);
  await createMainWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createMainWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { void database?.close(); });
