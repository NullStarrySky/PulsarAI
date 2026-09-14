import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	app,
	BrowserWindow,
	dialog,
	ipcMain,
	Notification,
	protocol,
	shell,
} from "electron";
import { createDatabase } from "./database.mjs";
import { hydrateSecretPlaceholders, secretPreview } from "./secret-utils.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const rendererUrl = process.env.ELECTRON_RENDERER_URL;
const applicationIcon = path.join(
	directory,
	"icons",
	process.platform === "win32" ? "icon.ico" : "icon.png",
);
const windows = new Map();
let mainWindow;
let database;
let availableUpdate = null;
let downloadedUpdatePath = null;

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
protocol.registerSchemesAsPrivileged([
	{
		scheme: "pulsar-media",
		privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
	},
]);

function requiredString(value, label) {
	if (typeof value !== "string" || !value.trim())
		throw new Error(`${label} is required.`);
	return value;
}

function senderWindow(event) {
	return BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
}

function sendTo(label, event, payload) {
	const target = label === "main" ? mainWindow : windows.get(label);
	if (!target || target.isDestroyed())
		throw new Error(`Window '${label}' is unavailable.`);
	target.webContents.send(`pulsar:host:event:${event}`, payload);
}

function newerVersion(candidate, current) {
	const normalize = (value) =>
		String(value)
			.replace(/^v/i, "")
			.split("-")[0]
			.split(".")
			.map((part) => Number(part) || 0);
	const left = normalize(candidate);
	const right = normalize(current);
	for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
		if ((left[index] ?? 0) !== (right[index] ?? 0))
			return (left[index] ?? 0) > (right[index] ?? 0);
	}
	return false;
}

function installerAsset(release) {
	const arch = process.arch === "arm64" ? "arm64" : "x64";
	const pattern =
		process.platform === "win32"
			? new RegExp(`${arch}.*\\.(?:exe|msi)$|\\.(?:exe|msi)$`, "i")
			: process.platform === "darwin"
				? new RegExp(`${arch}.*\\.dmg$|\\.dmg$`, "i")
				: new RegExp(`${arch}.*\\.(?:AppImage|deb)$|\\.(?:AppImage|deb)$`, "i");
	return release.assets?.find((asset) => pattern.test(asset.name));
}

async function checkForUpdate() {
	const response = await fetch(
		"https://api.github.com/repos/NullStarrySky/PulsarAI/releases/latest",
		{
			headers: {
				accept: "application/vnd.github+json",
				"user-agent": `PulsarAI/${app.getVersion()}`,
			},
		},
	);
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`检查更新失败：HTTP ${response.status}`);
	const release = await response.json();
	const asset = installerAsset(release);
	if (!asset || !newerVersion(release.tag_name, app.getVersion())) {
		availableUpdate = null;
		return null;
	}
	availableUpdate = {
		version: String(release.tag_name).replace(/^v/i, ""),
		name: release.name || release.tag_name,
		notes: release.body || "",
		publishedAt: release.published_at,
		asset: { name: asset.name, url: asset.browser_download_url },
	};
	const { asset: _asset, ...publicInfo } = availableUpdate;
	return publicInfo;
}

async function downloadUpdate() {
	if (!availableUpdate) await checkForUpdate();
	if (!availableUpdate) throw new Error("当前没有可下载的更新。");
	const response = await fetch(availableUpdate.asset.url, {
		headers: { "user-agent": `PulsarAI/${app.getVersion()}` },
	});
	if (!response.ok) throw new Error(`下载安装包失败：HTTP ${response.status}`);
	const directoryPath = path.join(
		app.getPath("temp"),
		"PulsarAI-updates",
		availableUpdate.version,
	);
	await mkdir(directoryPath, { recursive: true });
	downloadedUpdatePath = path.join(
		directoryPath,
		path.basename(availableUpdate.asset.name),
	);
	const total = Number(response.headers.get("content-length")) || 0;
	let downloaded = 0;
	const output = createWriteStream(downloadedUpdatePath);
	try {
		for await (const chunk of response.body) {
			downloaded += chunk.length;
			if (!output.write(chunk))
				await new Promise((resolve) => output.once("drain", resolve));
			sendTo("main", "update", {
				type: "download-progress",
				percent: total ? Math.round((downloaded / total) * 100) : null,
			});
		}
		await new Promise((resolve, reject) => {
			output.end(resolve);
			output.once("error", reject);
		});
	} catch (error) {
		output.destroy();
		throw error;
	}
	sendTo("main", "update", { type: "download-progress", percent: 100 });
	sendTo("main", "update", { type: "downloaded", path: downloadedUpdatePath });
	return { path: downloadedUpdatePath };
}

async function installUpdate() {
	if (!downloadedUpdatePath) throw new Error("请先下载安装包。");
	const error = await shell.openPath(downloadedUpdatePath);
	if (error) throw new Error(`无法启动安装包：${error}`);
	app.quit();
}

async function modelProxyFetch(request) {
	const input = request && typeof request === "object" ? request : {};
	const url = new URL(requiredString(input.url, "request.url"));
	if (!/^https?:$/.test(url.protocol))
		throw new Error("Only HTTP(S) proxy requests are allowed.");
	const headers = new Headers();
	for (const header of Array.isArray(input.headers) ? input.headers : []) {
		headers.set(
			header.name,
			await hydrateSecretPlaceholders(String(header.value ?? ""), (name) =>
				database.selectOne("host_secrets", name),
			),
		);
	}
	let body = Array.isArray(input.body)
		? Uint8Array.from(input.body)
		: undefined;
	if (body) {
		try {
			const text = new TextDecoder("utf-8", { fatal: true }).decode(body);
			body = new TextEncoder().encode(
				await hydrateSecretPlaceholders(text, (name) =>
					database.selectOne("host_secrets", name),
				),
			);
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
		const detail =
			error?.cause instanceof Error
				? error.cause.message
				: error instanceof Error
					? error.message
					: String(error);
		throw new Error(`模型请求失败：${detail}`);
	}
	return {
		status: response.status,
		headers: [...response.headers.entries()].map(([name, value]) => ({
			name,
			value,
		})),
		body: [...new Uint8Array(await response.arrayBuffer())],
	};
}

function proxyFetchTimeout(value) {
	if (value === undefined) return 30_000;
	if (!Number.isInteger(value) || value < 1 || value > 120_000)
		throw new Error("request.timeout must be an integer between 1 and 120000.");
	return value;
}

async function proxyFetch(request) {
	const input = request && typeof request === "object" ? request : {};
	const url = new URL(requiredString(input.url, "request.url"));
	if (!/^https?:$/.test(url.protocol))
		throw new Error("Only HTTP(S) proxy requests are allowed.");
	const redirect = input.redirect ?? "follow";
	if (!new Set(["follow", "manual", "error"]).has(redirect))
		throw new Error("request.redirect must be follow, manual, or error.");
	const headers = new Headers();
	for (const header of Array.isArray(input.headers) ? input.headers : [])
		headers.set(String(header.name ?? ""), String(header.value ?? ""));
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), proxyFetchTimeout(input.timeout));
	try {
		const response = await fetch(url, {
			method: typeof input.method === "string" ? input.method : "GET",
			headers,
			body: Array.isArray(input.body) ? Uint8Array.from(input.body) : undefined,
			redirect,
			signal: controller.signal,
		});
		return {
			url: response.url,
			status: response.status,
			statusText: response.statusText,
			redirected: response.redirected,
			headers: [...response.headers.entries()].map(([name, value]) => ({
				name,
				value,
			})),
			body: [...new Uint8Array(await response.arrayBuffer())],
		};
	} catch (error) {
		const detail =
			error?.cause instanceof Error
				? error.cause.message
				: error instanceof Error
					? error.message
					: String(error);
		throw new Error(`网络请求失败：${detail}`);
	} finally {
		clearTimeout(timeout);
	}
}

async function exaWebSearch(request) {
	if (request?.provider === "playwright") {
		throw new Error(
			"Playwright 桌面搜索将在 Electron 主进程浏览器服务接入后启用。",
		);
	}
	const apiKey = await database.selectOne(
		"host_secrets",
		"webSearch.exa.apiKey",
	);
	if (typeof apiKey !== "string" || !apiKey.trim())
		throw new Error("请先在网络搜索设置中填写 Exa API Key。");
	const response = await fetch("https://api.exa.ai/search", {
		method: "POST",
		headers: { "content-type": "application/json", "x-api-key": apiKey },
		body: JSON.stringify({
			query: requiredString(request?.query, "query"),
			type: "auto",
			numResults: Math.min(Math.max(Number(request?.limit) || 5, 1), 10),
			contents: { highlights: true },
		}),
	});
	if (!response.ok) throw new Error(`Exa 搜索请求失败：${response.status}`);
	const body = await response.json();
	return Array.isArray(body.results)
		? body.results
				.filter(
					(item) =>
						item &&
						typeof item.title === "string" &&
						typeof item.url === "string",
				)
				.map((item) => ({
					title: item.title,
					url: item.url,
					snippet: item.highlights?.[0] ?? item.summary ?? item.text ?? "",
				}))
		: [];
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
		return {
			rootPath: parent,
			isFile: true,
			entries: [await collect(parent, input)],
		};
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
			if (entries.length > 100000)
				throw new Error("扫描文件超过上限 100000，请缩小导入目录。");
		}
	}
	entries.sort((left, right) =>
		left.relativePath.localeCompare(right.relativePath),
	);
	return { rootPath: input, isFile: false, entries };
}

async function migration(method, payload) {
	const filePath = requiredString(payload?.path, "path");
	if (method === "scan") return scanMigrationPath(filePath);
	const bytes = await readFile(filePath);
	if (bytes.length > 64 * 1024 * 1024)
		throw new Error("文件过大，限制为 64 MiB。");
	if (method === "readText") return bytes.toString("utf8");
	if (method === "readBinary")
		return {
			mediaType: "application/octet-stream",
			base64: bytes.toString("base64"),
		};
	if (method === "readPngCharacter")
		throw new Error("Electron PNG 角色卡读取将在迁移解析器移植时启用。");
	throw new Error(`Unsupported migration operation: ${method}`);
}

function mediaRoot() {
	return path.join(app.getPath("userData"), "resources", "media");
}

function mediaId(value) {
	if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value))
		throw new Error("无效的媒体 ID。");
	return value;
}

function mediaDirectory(value) {
	const parts = String(value || "root")
		.split(/[\\/]+/)
		.filter(Boolean);
	if (!parts.length || parts.some((part) => !/^[A-Za-z0-9._-]+$/.test(part)))
		throw new Error("无效的媒体容器路径。");
	return path.join(mediaRoot(), ...parts);
}

function extensionForMediaType(mediaType) {
	const known = {
		"image/png": "png",
		"image/jpeg": "jpg",
		"image/webp": "webp",
		"image/gif": "gif",
		"image/avif": "avif",
		"video/mp4": "mp4",
		"video/webm": "webm",
		"audio/mpeg": "mp3",
		"audio/wav": "wav",
		"audio/ogg": "ogg",
		"application/pdf": "pdf",
	};
	return known[mediaType] ?? "bin";
}

function mediaTypeForFile(filePath) {
	const extension = path.extname(filePath).slice(1).toLowerCase();
	const known = {
		png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
		gif: "image/gif", avif: "image/avif", mp4: "video/mp4", webm: "video/webm",
		mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", pdf: "application/pdf",
	};
	return known[extension] ?? "application/octet-stream";
}

async function findMediaFile(id) {
	const pending = [mediaRoot()];
	while (pending.length) {
		const current = pending.pop();
		let entries;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch (error) {
			if (error?.code === "ENOENT") break;
			throw error;
		}
		for (const entry of entries) {
			const candidate = path.join(current, entry.name);
			if (entry.isDirectory()) pending.push(candidate);
			else if (entry.isFile() && entry.name.startsWith(`${id}.`)) return candidate;
		}
	}
	throw new Error("媒体文件不存在。");
}

async function media(method, payload) {
	if (method === "write") {
		const bytes = Array.isArray(payload?.bytes) ? Uint8Array.from(payload.bytes) : null;
		if (!bytes) throw new Error("媒体字节无效。");
		const type = typeof payload?.mediaType === "string" ? payload.mediaType : "application/octet-stream";
		const id = randomUUID();
		const directoryPath = mediaDirectory(payload?.path);
		await mkdir(directoryPath, { recursive: true });
		await writeFile(path.join(directoryPath, `${id}.${extensionForMediaType(type)}`), bytes);
		return { id, mediaType: type, size: bytes.length };
	}
	const id = mediaId(payload?.id);
	const filePath = await findMediaFile(id);
	if (method === "read") {
		const bytes = await readFile(filePath);
		return { id, mediaType: mediaTypeForFile(filePath), size: bytes.length, bytes: [...bytes] };
	}
	if (method === "url") return `pulsar-media://${id}`;
	if (method === "remove") return unlink(filePath);
	throw new Error(`Unsupported media operation: ${method}`);
}

async function readResourceBundleDirectory(root) {
	const files = {};
	const pending = [root];
	let total = 0;
	while (pending.length) {
		const current = pending.pop();
		for (const entry of await readdir(current, { withFileTypes: true })) {
			const target = path.join(current, entry.name);
			if (entry.isSymbolicLink()) continue;
			if (entry.isDirectory()) pending.push(target);
			else if (entry.isFile()) {
				const bytes = await readFile(target);
				total += bytes.length;
				if (total > 64 * 1024 * 1024) throw new Error("资源文件夹超过 64 MiB 限制。");
				files[path.relative(root, target).replaceAll("\\", "/")] = [...bytes];
			}
		}
	}
	return files;
}

async function resourceBundle(method, payload) {
	const target = requiredString(payload?.path, "path");
	if (method === "resource_bundle_write") {
		const bytes = Array.isArray(payload?.bytes) ? Uint8Array.from(payload.bytes) : null;
		if (!bytes) throw new Error("资源压缩包内容无效。");
		await writeFile(target, bytes);
		return;
	}
	if (method === "resource_bundle_read") {
		const meta = await stat(target);
		return meta.isDirectory() ? readResourceBundleDirectory(target) : [...await readFile(target)];
	}
	throw new Error(`Unsupported backup operation: ${method}`);
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
		child.stdout.on("data", (value) => {
			stdout += value;
		});
		child.stderr.on("data", (value) => {
			stderr += value;
		});
		child.on("error", reject);
		child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
	});
}

async function handleHostInvoke(event, namespace, method, payload = {}) {
	if (namespace === "database") {
		if (method === "selectAll") return database.selectAll(payload.table);
		if (method === "selectByField")
			return database.selectByField(
				payload.table,
				payload.field,
				payload.value,
			);
		if (method === "selectOne")
			return database.selectOne(payload.table, payload.id);
		if (method === "upsert")
			return database.upsert(payload.table, payload.id, payload.value);
		if (method === "update")
			return database.update(payload.table, payload.id, payload.patches);
		if (method === "remove") return database.remove(payload.table, payload.id);
		if (method === "resetCharacterData") return database.resetCharacterData();
	}
	if (namespace === "config") {
		if (method === "get") return database.selectOne("config", payload.key);
		if (method === "set")
			return database.upsert("config", payload.key, payload.value);
		if (method === "remove") return database.remove("config", payload.key);
	}
	if (namespace === "secrets") {
		if (method === "has")
			return Boolean(await database.selectOne("host_secrets", payload.name));
		if (method === "preview")
			return secretPreview(
				await database.selectOne("host_secrets", payload.name),
			);
		if (method === "set")
			return database.upsert("host_secrets", payload.name, payload.value);
		if (method === "clearValue")
			return database.upsert("host_secrets", payload.name, "");
		if (method === "remove")
			return database.remove("host_secrets", payload.name);
	}
	if (namespace === "window") {
		const target = senderWindow(event);
		if (method === "minimize") return target?.minimize();
		if (method === "toggleMaximize")
			return target?.isMaximized() ? target.unmaximize() : target?.maximize();
		if (method === "close") return target?.close();
		if (method === "hide") return target?.hide();
	}
	if (namespace === "desktop") {
		if (method === "openExternal")
			return shell.openExternal(requiredString(payload.url, "url"));
		if (method === "executeEnvironmentCommand")
			return executeEnvironmentCommand(payload.name);
	}
	if (namespace === "update") {
		if (method === "check") return checkForUpdate();
		if (method === "download") return downloadUpdate();
		if (method === "install") return installUpdate();
	}
	if (namespace === "dialog") {
		const target = senderWindow(event);
		if (method === "open") {
			const result = await dialog.showOpenDialog(target, payload.options);
			return result.canceled
				? null
				: payload.options?.multiple
					? result.filePaths
					: (result.filePaths[0] ?? null);
		}
		if (method === "save") {
			const result = await dialog.showSaveDialog(target, payload.options);
			return result.canceled ? null : (result.filePath ?? null);
		}
	}
	if (namespace === "subWindow") {
		if (method === "create") {
			const label = requiredString(payload.label, "label");
			const parent = mainWindow;
			const child = new BrowserWindow({
				...windowOptions,
				width: payload.width ?? 980,
				height: payload.height ?? 720,
				title: payload.title ?? "PulsarAI",
				parent,
				show: !payload.hidden,
			});
			windows.set(label, child);
			child.on("closed", () => windows.delete(label));
			child.webContents.setWindowOpenHandler(({ url }) => {
				void shell.openExternal(url);
				return { action: "deny" };
			});
			const url = new URL(
				requiredString(payload.url, "url"),
				parent.webContents.getURL(),
			).toString();
			if (rendererUrl) await child.loadURL(url);
			else
				await child.loadFile(
					path.join(directory, "..", "..", "dist", "index.html"),
					{
						query: {
							subwindow: new URL(url).searchParams.get("subwindow") ?? "",
						},
					},
				);
			return;
		}
		if (method === "send")
			return sendTo(payload.label, payload.event, payload.payload);
		if (method === "close") return windows.get(payload.label)?.close();
	}
	if (namespace === "network") {
		if (method === "modelProxyFetch") return modelProxyFetch(payload.request);
		if (method === "proxyFetch") return proxyFetch(payload.request);
		if (method === "webSearch") return exaWebSearch(payload.request);
	}
	if (namespace === "notifications" && method === "send") {
		if (Notification.isSupported())
			new Notification({
				title: requiredString(payload.title, "title"),
				body: String(payload.body ?? ""),
			}).show();
		return;
	}
	if (namespace === "migration") return migration(method, payload);
	if (namespace === "media") return media(method, payload);
	if (namespace === "backup") return resourceBundle(method, payload);
	throw new Error(`Unsupported host operation: ${namespace}.${method}`);
}

async function createMainWindow() {
	mainWindow = new BrowserWindow(windowOptions);
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});
	if (rendererUrl) await mainWindow.loadURL(rendererUrl);
	else
		await mainWindow.loadFile(
			path.join(directory, "..", "..", "dist", "index.html"),
		);
}

app.whenReady().then(async () => {
	database = await createDatabase(app.getPath("userData"));
	protocol.handle("pulsar-media", async (request) => {
		try {
			const filePath = await findMediaFile(mediaId(new URL(request.url).hostname));
			return new Response(await readFile(filePath), {
				headers: { "content-type": mediaTypeForFile(filePath) },
			});
		} catch {
			return new Response("媒体文件不存在。", { status: 404 });
		}
	});
	ipcMain.handle("pulsar:host:invoke", handleHostInvoke);
	await createMainWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
	void database?.close();
});
