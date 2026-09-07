import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import {
	cleanupAppLifetimeChats,
	createChat,
	loadChat,
} from "../chats/chat-service";
import {
	closeInterval,
	evaluateIntervals,
	openInterval,
} from "../messages/interval-service";
import {
	createContainer,
	loadContainersForChat,
	pathForTail,
	persistContainer,
} from "../messages/message-service";
import type { ChatMessageContainer } from "../messages/message-types";
import { resetMockHostDatabase } from "@/features/Database/mock-database";
import { useWindowLifecycleStore } from "@/features/UI/window-lifecycle-store";

function container(
	role: ChatMessageContainer["role"],
	previousContainer?: string,
): ChatMessageContainer {
	return createContainer({ conversationId: "chat", role, previousContainer });
}

function open(
	container: ChatMessageContainer,
	id: string,
	autoEndAfter?: number,
) {
	container.content[0]!.meta.intervalOperations ??= [];
	container.content[0]!.meta.intervalOperations.push(
		{
			kind: "interval.open",
			interval: { id, type: "memory", autoEndAfter },
		},
	);
}

function close(container: ChatMessageContainer, intervalId: string) {
	container.content[0]!.meta.intervalOperations = [
		{ kind: "interval.close", intervalId },
	];
}

beforeEach(() => {
	resetMockHostDatabase();
	setActivePinia(createPinia());
});

describe("Interval projection", () => {
	it("creates an explicit span without persisting a derived span", () => {
		const start = container("user");
		const end = container("assistant", start.id);
		open(start, "focus");
		close(end, "focus");

		const result = evaluateIntervals([start, end]);
		expect(result.spans).toMatchObject([
			{ interval: { id: "focus" }, closeKind: "explicit" },
		]);
		expect(end.content[0]!.meta.intervalOperations).toEqual([
			{ kind: "interval.close", intervalId: "focus" },
		]);
	});

	it("auto closes after the Nth later visible container and ignores system containers", () => {
		const start = container("user");
		const hidden = container("system", start.id);
		const firstVisible = container("assistant", hidden.id);
		const secondVisible = container("user", firstVisible.id);
		open(start, "one", 1);
		open(start, "two", 2);

		const afterHidden = evaluateIntervals([start, hidden]);
		expect(afterHidden.openIntervals.map((item) => item.interval.id)).toEqual([
			"one",
			"two",
		]);

		const result = evaluateIntervals([start, hidden, firstVisible, secondVisible]);
		expect(result.spans.map((span) => [span.interval.id, span.closeKind])).toEqual([
			["one", "auto"],
			["two", "auto"],
		]);
		expect(result.spans.map((span) => span.closedAt.containerId)).toEqual([
			firstVisible.id,
			secondVisible.id,
		]);
	});

	it("diagnoses duplicate opens, missing closes, and unclosed intervals", () => {
		const message = container("user");
		open(message, "duplicate");
		message.content[0]!.meta.intervalOperations!.push({
			kind: "interval.open",
			interval: { id: "duplicate", type: "memory" },
		});
		message.content[0]!.meta.intervalOperations!.push({
			kind: "interval.close",
			intervalId: "missing",
		});

		expect(evaluateIntervals([message]).diagnostics.map((item) => item.code)).toEqual([
			"interval.duplicate-open",
			"interval.close-missing",
			"interval.unclosed",
		]);
	});

	it("changes with the selected message version", () => {
		const versioned = container("user");
		open(versioned, "version-a");
		versioned.content.push({
			...structuredClone(versioned.content[0]!),
			id: "version-b",
			meta: { steps: [] },
		});

		versioned.activeMessage = 0;
		expect(evaluateIntervals([versioned]).openIntervals).toHaveLength(1);
		versioned.activeMessage = 1;
		expect(evaluateIntervals([versioned]).openIntervals).toHaveLength(0);
	});

	it("changes when the active branch switches without leaking intervals", () => {
		const root = container("user");
		const branchWithInterval = container("assistant", root.id);
		const otherBranch = container("assistant", root.id);
		open(branchWithInterval, "branch-only");
		root.availableNextContainer = [branchWithInterval.id, otherBranch.id];
		root.activeNextContainer = branchWithInterval.id;

		const containers = [root, branchWithInterval, otherBranch];
		expect(
			evaluateIntervals(pathForTail(containers, root.activeNextContainer)).openIntervals,
		).toHaveLength(1);
		root.activeNextContainer = otherBranch.id;
		expect(
			evaluateIntervals(pathForTail(containers, root.activeNextContainer)).openIntervals,
		).toHaveLength(0);
	});

	it("writes operations to the concrete message version through the message service", async () => {
		const chat = await createChat({ localPluginId: "plugin" });
		const messageContainer = createContainer({
			conversationId: chat.id,
			role: "user",
		});
		await persistContainer(messageContainer);
		const message = messageContainer.content[0]!;
		await openInterval([messageContainer], message, {
			id: "stored",
			type: "memory",
			content: { level: 1 },
		});
		await closeInterval([messageContainer], message, "stored");

		const reloaded = await loadContainersForChat(chat.id);
		expect(reloaded[0]?.content[0]?.meta.intervalOperations).toHaveLength(2);
	});
});

describe("app-lifetime conversations", () => {
	it("startup cleanup cascades app chats and leaves persistent chats", async () => {
		const appChat = await createChat({ localPluginId: "plugin", lifetime: "app" });
		const appContainer = createContainer({ conversationId: appChat.id, role: "user" });
		await persistContainer(appContainer);
		const persistent = await createChat({ localPluginId: "plugin" });
		await persistContainer(createContainer({ conversationId: persistent.id, role: "user" }));

		expect(await cleanupAppLifetimeChats()).toBe(1);
		expect(await loadChat(appChat.id)).toBeNull();
		expect(await loadContainersForChat(appChat.id)).toEqual([]);
		expect((await loadChat(persistent.id))?.lifetime).toBe("persistent");
		expect(await loadContainersForChat(persistent.id)).toHaveLength(1);
	});

	it("hiding to tray does not trigger app-lifetime cleanup", async () => {
		const appChat = await createChat({ localPluginId: "plugin", lifetime: "app" });
		await useWindowLifecycleStore().applyCloseChoice("tray");
		expect(await loadChat(appChat.id)).not.toBeNull();
	});
});
