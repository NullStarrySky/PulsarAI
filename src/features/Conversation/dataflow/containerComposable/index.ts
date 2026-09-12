import { usePureContainer } from "../containers";
import { useContainerActions } from "./actions";
import { useContainerAttachments } from "./attachments";
import { useContainerBranch } from "./branch";
import { useContainerIntervals } from "./intervals";
import { useContainerMessage } from "./message";
import { useContainerVersion } from "./version";

/** All behaviour scoped to one persisted message container. */
export function useContainerComposable(chatId: string, containerId: string) {
	const container = usePureContainer(chatId, containerId);
	return {
		container,
		version: useContainerVersion(container),
		branch: useContainerBranch(container),
		message: useContainerMessage(container),
		attachments: useContainerAttachments(container),
		interval: useContainerIntervals(container),
		utility: useContainerActions(container),
	};
}

export * from "./actions";
export * from "./attachments";
export * from "./branch";
export * from "./intervals";
export * from "./message";
export * from "./version";
