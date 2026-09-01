import type { ModelMessage } from "ai";
import { computed } from "vue";
import { useChatStore } from "@/features/Conversation/chats/chat-store";
import type {
	ChatMessage,
	ChatMessageContainer,
} from "@/features/Conversation/messages/conversation-types";
import type { ResourceImportEnvironment } from "@/features/Plugin/resources/resource-wrapper";
import { PluginLogger } from "@/features/Plugin/runtime";
import { useWorld, type WorldScope } from "@/features/Plugin/tree/world-store";
import {
	resolveSandboxMessagesAsync,
	resolveSandboxTextAsync,
} from "@/features/Sandbox/sandbox";

export interface WorldSelfApiOptions {
	packageId?: string;
	conversationId?: string;
	container?: ChatMessageContainer;
	messageVersion?: ChatMessage;
	logger?: PluginLogger;
}

function isModelMessage(value: unknown): value is ModelMessage {
	return Boolean(
		value && typeof value === "object" && "role" in value && "content" in value,
	);
}

function sourceRoot(path: string) {
	const parts = path.split("/").filter(Boolean);
	if (parts[0] === "self") return "/self";
	return parts.length > 2 ? `/${parts.slice(0, 2).join("/")}` : "/global";
}

function resolveSourcePath(sourcePath: string, request: string) {
	if (request.startsWith("/")) return request;
	const root = sourceRoot(sourcePath);
	if (request.startsWith("@/")) return `${root}/${request.slice(2)}`;
	const parent = sourcePath.split("/").slice(0, -1);
	for (const part of request.split("/")) {
		if (!part || part === ".") continue;
		if (part === "..") parent.pop();
		else parent.push(part);
	}
	return `/${parent.join("/")}`;
}

/** World-scoped filesystem and slot API for one source resource. */
export function createWorldSelfApi(
	sourcePath: string,
	options: WorldSelfApiOptions = {},
) {
	const conversationId = options.conversationId ?? "";
	const packageId =
		options.packageId ??
		useChatStore().chats.find((item) => item.id === conversationId)
			?.packageId ??
		"";
	const scope = computed<WorldScope>(() => ({
		packageId,
		conversationId,
		applyReplay: Boolean(conversationId),
		...(options.container && options.messageVersion
			? {
					replay: {
						container: options.container,
						message: options.messageVersion,
					},
				}
			: {}),
	}));
	const world = useWorld(scope);
	const logger = options.logger ?? new PluginLogger();
	const absolute = (path: string) => resolveSourcePath(sourcePath, path);
	const slot = {
		list: () => world.slots.value,
		get: (path: string) =>
			world.slots.value.find((item) => item.path === path) ?? null,
		paths: (path: string) =>
			(
				world.slots.value.find((item) => item.path === path)?.resources ?? []
			).map((item) => item.path),
		import: (path: string) =>
			(
				world.slots.value.find((item) => item.path === path)?.resources ?? []
			).map((item) => item.path),
	};
	const importResource = (
		path: string | string[],
		environment: ResourceImportEnvironment = {},
	): unknown | Promise<unknown> => {
		const resolved = Array.isArray(path) ? path.map(absolute) : absolute(path);
		return world.import(resolved, {
			...environment,
			imports: environment.imports ?? importResource,
			logger,
		});
	};
	const parse = async (
		path: string | string[],
		input: ResourceImportEnvironment = {},
	) => {
		const environment = {
			...input,
			imports: input.imports ?? importResource,
			logger,
		};
		const imported = await importResource(path, environment);
		if (typeof imported === "string")
			return resolveSandboxTextAsync(imported, [environment], { logger });
		if (Array.isArray(imported) && imported.every(isModelMessage))
			return resolveSandboxMessagesAsync(imported, [environment], { logger });
		return imported;
	};
	return {
		read: (path: string) => world.read(absolute(path)),
		write: (path: string, content: unknown) =>
			world.write(absolute(path), content),
		edit: (path: string, find: string, replace: string) =>
			world.edit(absolute(path), find, replace),
		mkdir: (path: string) => world.mkdir(absolute(path)),
		move: (from: string, to: string) =>
			world.move(absolute(from), absolute(to)),
		remove: (path: string) => world.remove(absolute(path)),
		exists: (path: string) => world.exists(absolute(path)),
		ls: (path = "/") => (path === "/" ? world.ls() : world.ls(absolute(path))),
		open: (path: string) => world.open(absolute(path)),
		close: (path: string) => world.close(absolute(path)),
		toggle: (path: string) => world.toggle(absolute(path)),
		import: importResource,
		run: importResource,
		parse,
		slot,
		logger,
		world,
	};
}
