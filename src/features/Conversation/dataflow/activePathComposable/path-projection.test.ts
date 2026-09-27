import { expect, it, vi } from "vitest";
import { effectScope, reactive, ref, shallowReactive } from "vue";
import { emptyRecal } from "@/features/Plugin/dataflow/recalculate";
import { containerChanges } from "../containers";
import type { ConversationContainer } from "../types";
import { createContainer, createMessage } from "./message-service";
import { usePathProjection } from "./path-projection";

vi.mock("@/features/Database/dbsync-store", () => ({ useSyncStore: vi.fn() }));
vi.mock("@/features/Plugin/media/media-link", () => ({
	readMediaLink: vi.fn(),
}));

it("updates final deltas and switches message versions and branches without leaking replay groups", () => {
	const make = (
		input: Parameters<typeof createContainer>[0],
	): ConversationContainer =>
		reactive(createContainer(input)) as ConversationContainer;
	const first = make({ conversationId: "chat", role: "user" });
	const second = make({
		conversationId: "chat",
		role: "assistant",
		previousContainer: first.id,
	});
	const sibling = make({
		conversationId: "chat",
		role: "assistant",
		previousContainer: first.id,
	});
	const containers = shallowReactive(
		new Map<string, ConversationContainer>(
			[first, second, sibling].map((item) => [item.id, item]),
		),
	);
	const tail = ref(second.id);
	const scope = effectScope();
	try {
		const projection = scope.run(() => usePathProjection(containers, tail))!;
		const prefix = projection.replayGroups.value[0];
		second.content[0]!.meta.recal = {
			self: { "/a": { delete: true } },
			global: {},
		};
		containerChanges(containers).value = {
			id: second.id,
			isBranchChange: false,
		};
		expect(projection.replayRecals.value[1]).toEqual(
			second.content[0]!.meta.recal,
		);
		expect(projection.replayGroups.value[0]).toBe(prefix);
		second.content.push(createMessage());
		second.activeMessage = 1;
		containerChanges(containers).value = {
			id: second.id,
			isBranchChange: false,
		};
		expect(projection.replayRecals.value[1]).toEqual(emptyRecal());
		tail.value = sibling.id;
		expect(
			projection.replayGroups.value.map((group) => group.container.id),
		).toEqual([first.id, sibling.id]);
		expect(projection.replayRecals.value[1]).toEqual(emptyRecal());
		tail.value = second.id;
		second.activeMessage = 0;
		containerChanges(containers).value = {
			id: second.id,
			isBranchChange: false,
		};
		expect(projection.replayRecals.value[1]).toEqual(
			second.content[0]!.meta.recal,
		);
	} finally {
		scope.stop();
	}
});
