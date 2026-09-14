import {
	computed,
	type MaybeRefOrGetter,
	ref,
	toRaw,
	toValue,
	watch,
} from "vue";
import { containerChanges } from "../containers";
import type { ChatContainer, ChatMessage } from "../types";
import { currentMessage } from "./message-service";

export interface ReplayGroup {
	container: ChatContainer;
	version: ChatMessage;
	pulses: NonNullable<ChatMessage["meta"]["pulses"]>;
}

/** Lazy per-consumer projection: notifications accumulate until its next read. */
export function usePathProjection(
	source: MaybeRefOrGetter<ReadonlyMap<string, ChatContainer>>,
	tail: MaybeRefOrGetter<string | null | undefined>,
) {
	const branches = new Set<string>(),
		versions = new Set<string>();
	const branchRevision = ref(0),
		groupRevision = ref(0);
	let positions = new Map<string, number>();
	let collection: ReadonlyMap<string, ChatContainer> | undefined;
	const idOf = (container: ChatContainer) => toRaw(container).id;
	watch(
		() => containerChanges(toValue(source)).value,
		(change) => {
			if (!change) return;
			versions.add(change.id);
			groupRevision.value++;
			if (change.isBranchChange) {
				branches.add(change.id);
				branchRevision.value++;
			}
		},
		{ flush: "sync" },
	);

	const activePath = computed<ChatContainer[]>((previous) => {
		branchRevision.value;
		const all = toValue(source),
			tailId = toValue(tail);
		all.size; // Inserts/deletes also invalidate a path, including an initially missing tail.
		let limit = all === collection && previous ? previous.length : 0;
		for (const id of branches) {
			const index = positions.get(id);
			if (index !== undefined) limit = Math.min(limit, index);
		}
		branches.clear();
		const suffix: ChatContainer[] = [],
			seen = new Set<string>();
		let current = tailId ? all.get(tailId) : undefined,
			prefixLength = 0;
		while (current && !seen.has(current.id)) {
			const index = positions.get(current.id);
			if (
				index !== undefined &&
				index < limit &&
				previous?.[index] === current
			) {
				prefixLength = index + 1;
				break;
			}
			seen.add(current.id);
			suffix.push(current);
			current = current.previousContainer
				? all.get(current.previousContainer)
				: undefined;
		}
		collection = all;
		if (previous && prefixLength === previous.length && !suffix.length)
			return previous;
		const path = (previous?.slice(0, prefixLength) ?? []).concat(
			suffix.reverse(),
		);
		if (
			previous &&
			path.length === previous.length &&
			path.every((item, index) => item === previous[index])
		)
			return previous;
		positions = new Map(path.map((item, index) => [idOf(item), index]));
		return path;
	});

	let previousPath: ChatContainer[] | undefined;
	let groupPositions = new Map<string, number>();
	const emptyPulses: ReplayGroup["pulses"] = [];
	const makeGroup = (container: ChatContainer): ReplayGroup | null => {
		const version = currentMessage(container);
		return version
			? { container, version, pulses: version.meta.pulses ?? emptyPulses }
			: null;
	};
	const replayGroups = computed<ReplayGroup[]>((previous) => {
		groupRevision.value;
		const path = activePath.value;
		let groups = previous ?? [];
		const pathChanged = path !== previousPath;
		if (pathChanged) {
			let prefix = 0;
			while (prefix < path.length && path[prefix] === previousPath?.[prefix])
				prefix++;
			let groupPrefix = groups.length;
			for (let i = prefix; previousPath && i < previousPath.length; i++) {
				const index = groupPositions.get(idOf(previousPath[i]!));
				if (index !== undefined) {
					groupPrefix = index;
					break;
				}
			}
			groups = groups.slice(0, groupPrefix).concat(
				path.slice(prefix).flatMap((item) => {
					const g = makeGroup(item);
					return g ? [g] : [];
				}),
			);
			groupPositions = new Map(
				groups.map((g, index) => [idOf(g.container), index]),
			);
			previousPath = path;
		}
		{
			// Reactive selected-version dependencies provide a conservative fallback
			// for an explicit direct mutation that did not emit a notification.
			const ids = versions.size
				? versions
				: pathChanged
					? []
					: groupPositions.keys();
			let copied = false;
			for (const id of ids) {
				const index = groupPositions.get(id),
					pathIndex = positions.get(id);
				if (pathIndex === undefined) continue;
				const replacement = makeGroup(path[pathIndex]!);
				if (index === undefined || !replacement) {
					groups = path.flatMap((item) => {
						const g = makeGroup(item);
						return g ? [g] : [];
					});
					groupPositions = new Map(
						groups.map((g, i) => [idOf(g.container), i]),
					);
					break;
				}
				const old = groups[index]!;
				if (
					old.version === replacement.version &&
					old.pulses === replacement.pulses
				)
					continue;
				if (!copied) {
					groups = groups.slice();
					copied = true;
				}
				groups[index] = replacement;
			}
		}
		versions.clear();
		return groups;
	});
	const replayPulses = computed(() =>
		replayGroups.value.map((group) => group.pulses),
	);
	return { activePath, replayGroups, replayPulses };
}
