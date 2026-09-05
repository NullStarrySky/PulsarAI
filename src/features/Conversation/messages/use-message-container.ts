import { computed, type MaybeRef, unref } from "vue";
import type { ChatMessage, ChatMessageContainer } from "./message-types";
import {
	type MessageVersionOptions,
	useMessageVersion,
} from "./use-message-version";

export interface MessageContainerOptions extends MessageVersionOptions {
	parentContainer?: ChatMessageContainer | null;
	onSwitchVersion?: (containerId: string, index: number) => Promise<void> | void;
	onSwitchBranch?: (
		containerId: string,
		branchId: string,
	) => Promise<void> | void;
	onRegenerate?: (containerId: string) => Promise<void> | void;
}

export function useMessageContainer(
	containerRef: MaybeRef<ChatMessageContainer>,
	options: MessageContainerOptions = {},
) {
	const container = computed(() => unref(containerRef));

	const activeVersionIndex = computed(() => {
		const c = container.value;
		return c?.activeMessage ?? 0;
	});

	const versionCount = computed(() => {
		return container.value?.content?.length ?? 1;
	});

	const currentMessage = computed<ChatMessage | null>(() => {
		const c = container.value;
		if (!c || !c.content?.length) return null;
		const idx = activeVersionIndex.value;
		return c.content[idx] ?? c.content[0] ?? null;
	});

	const versionActions = useMessageVersion(currentMessage, {
		packageId: options.packageId,
		onUpdateContent: (content) => {
			if (options.onUpdateContent) {
				return options.onUpdateContent(content);
			}
		},
		onUpdateTranslation: (content, translation) => {
			if (options.onUpdateTranslation) {
				return options.onUpdateTranslation(content, translation);
			}
		},
	});

	const availableBranchIds = computed<string[]>(() => {
		const parent = options.parentContainer;
		return parent?.availableNextContainer ?? [];
	});

	const branchCount = computed(() => availableBranchIds.value.length);

	const activeBranchIndex = computed(() => {
		const c = container.value;
		const parent = options.parentContainer;
		if (!c || !parent) return 0;
		const idx = parent.availableNextContainer.indexOf(c.id);
		return idx >= 0 ? idx : 0;
	});

	async function gotoVersion(index: number) {
		const c = container.value;
		if (!c || index < 0 || index >= (c.content?.length ?? 0)) return;
		if (options.onSwitchVersion) {
			await options.onSwitchVersion(c.id, index);
		}
	}

	async function prevVersion() {
		await gotoVersion(activeVersionIndex.value - 1);
	}

	async function nextVersion() {
		await gotoVersion(activeVersionIndex.value + 1);
	}

	async function gotoBranch(branchId: string) {
		const c = container.value;
		if (!c || !branchId) return;
		if (options.onSwitchBranch) {
			await options.onSwitchBranch(c.id, branchId);
		}
	}

	async function regenerate() {
		const c = container.value;
		if (!c) return;
		if (options.onRegenerate) {
			await options.onRegenerate(c.id);
		}
	}

	return {
		container,
		currentMessage,
		activeVersionIndex,
		versionCount,
		availableBranchIds,
		branchCount,
		activeBranchIndex,
		gotoVersion,
		prevVersion,
		nextVersion,
		gotoBranch,
		regenerate,
		...versionActions,
	};
}
