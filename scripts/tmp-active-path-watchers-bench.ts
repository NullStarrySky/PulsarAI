// bun scripts/tmp-active-path-watchers-bench.ts [--all-containers] [--positions]
// Real composables, Vue scheduling and structures; no UI/DB I/O/stateful Pulse replay.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import {
	computed,
	effectScope,
	nextTick,
	reactive,
	ref,
	shallowReactive,
	shallowRef,
	toValue,
	toRaw,
	unref,
	watch,
} from "vue";
import {
	createChatMeta,
	type ChatContainer,
} from "../src/features/Conversation/dataflow/types";
import { evaluateIntervals } from "../src/features/Conversation/dataflow/activePathComposable/interval-services";

const read = (file: string) =>
	readFileSync(new URL(`../src/features/${file}`, import.meta.url), "utf8");
function load(
	source: string,
	names: string[],
	bindings: Record<string, unknown> = {},
) {
	const js = new Bun.Transpiler({ loader: "ts" })
		.transformSync(source)
		.replaceAll("export ", "");
	return new Function(
		...Object.keys(bindings),
		`${js}; return {${names.join(",")}}`,
	)(...Object.values(bindings));
}
const service = read(
	"Conversation/dataflow/activePathComposable/message-service.ts",
);
const { currentMessage, pathForTail } = load(
	service.slice(
		service.indexOf("export function currentMessage("),
		service.indexOf("export async function modelMessagesFromPath("),
	),
	["currentMessage", "pathForTail"],
) as typeof import("../src/features/Conversation/dataflow/activePathComposable/message-service");
const project = (path: ChatContainer[]) =>
	path.flatMap((container) => {
		const version = currentMessage(container);
		return version
			? [{ container, version, pulses: version.meta.pulses ?? [] }]
			: [];
	});
let sink = 0;
function setup(n: number, ratio: number, incremental: boolean) {
	const scope = effectScope(),
		started = performance.now();
	const result = scope.run(() => {
		const split = Math.floor(n * ratio);
		const make = (id: string, parent: string | null): ChatContainer => ({
			id,
			conversationid: "bench",
			role: "user",
			previousContainer: parent,
			activeMessage: 0,
			activeNextContainer: null,
			availableNextContainer: [],
			content: [0, 1].map((v) => ({
				id: `${id}-v${v}`,
				type: "message",
				content: "x".repeat(128),
				createdAt: "",
				parts: [],
				meta: { steps: [], pulses: [] },
			})),
		});
		const a = Array.from({ length: n }, (_, i) =>
			make(`a${i}`, i ? `a${i - 1}` : null),
		);
		const b = Array.from({ length: n - split }, (_, i) =>
			make(`b${i}`, i ? `b${i - 1}` : `a${split - 1}`),
		);
		for (const path of [a, b])
			for (let i = 0; i < path.length - 1; i++) {
				path[i]!.activeNextContainer = path[i + 1]!.id;
				path[i]!.availableNextContainer = [path[i + 1]!.id];
			}
		a[split - 1]!.availableNextContainer.push("b0");
		const list = shallowReactive(
				new Map([...a, ...b].map((c) => [c.id, reactive(c)])),
			),
			containers = shallowReactive(new Map([["bench", list]]));
		const meta = reactive({
			...createChatMeta({ localPluginId: "local", pluginVersionId: "v" }),
			id: "bench",
			rootContainerId: "a0",
			lastContainerId: `a${n - 1}`,
		});
		const chatMeta = shallowReactive(
				new Map([["local", shallowReactive(new Map([["bench", meta]]))]]),
			),
			dirty = new Set<string>();
		let handles = 0;
		const store = {
			containers,
			chatMeta,
			trackChatPluginVersion: () => {},
			markDirty: (t: { type: string; id: string }) =>
				dirty.add(`${t.type}:${t.id}`),
		};
		const shared = {
			computed,
			ref,
			shallowRef,
			toValue,
			toRaw,
			unref,
			watch,
			currentMessage,
			useSyncStore: () => store,
		};
		const source = read("Conversation/dataflow/containers.ts");
		const api = load(
			source.slice(
				source.indexOf("export interface ContainerChange"),
				source.indexOf("function containersForChat("),
			) + source.slice(source.indexOf("export function useContainer(")),
			["containerChanges", "markContainerDirty", "useContainer"],
			shared,
		);
		const chats = read("Conversation/dataflow/chats.ts");
		const { useChat } = load(
			chats.slice(
				chats.indexOf("export function chatRecord("),
				chats.indexOf("export function useChatList("),
			) +
				chats.slice(
					chats.indexOf("export function useChat("),
					chats.indexOf("/** Generation is runtime"),
				),
			["useChat"],
			{ ...shared, findChat: () => meta },
		);
		const ids = process.argv.includes("--all-containers")
			? [...list.keys()]
			: [
					...new Set([
						`a${split - 1}`,
						...a.slice(-40).map((c) => c.id),
						...b.slice(-40).map((c) => c.id),
					]),
				];
		for (const id of ids) {
			api.useContainer("bench", id);
			handles++;
		}
		const bindings = { ...shared, ...api };
		const versionSource = read(
				"Conversation/dataflow/containerComposable/version.ts",
			),
			branchSource = read(
				"Conversation/dataflow/containerComposable/branch.ts",
			),
			projectionSource = read(
				"Conversation/dataflow/activePathComposable/path-projection.ts",
			);
		const { useContainerVersion } = load(
			versionSource.slice(
				versionSource.indexOf("export function useContainerVersion("),
			),
			["useContainerVersion"],
			bindings,
		);
		const { useContainerBranch } = load(
			branchSource.slice(
				branchSource.indexOf("export function useContainerBranch("),
			),
			["useContainerBranch"],
			bindings,
		);
		const { usePathProjection } = load(
			projectionSource.slice(
				projectionSource.indexOf("export interface ReplayGroup"),
			),
			["usePathProjection"],
			bindings,
		);
		const views = Array.from({ length: 3 }, () => {
			const chat = useChat("bench"),
				source = computed(() => containers.get("bench")!);
			const activePath = computed(() =>
					pathForTail(source.value, chat.value?.lastContainerId),
				),
				replayGroups = computed(() => project(activePath.value));
			const full = {
				activePath,
				replayGroups,
				replayPulses: computed(() => replayGroups.value.map((g) => g.pulses)),
			};
			const view = incremental
				? usePathProjection(source, () => chat.value?.lastContainerId)
				: full;
			return {
				...view,
				intervals: computed(() => evaluateIntervals(view.activePath.value)),
			};
		});
		const version = useContainerVersion(list.get(`a${split - 1}`));
		let alternate = false;
		function mutate(kind: "version" | "branch") {
			if (kind === "version") version.goto(1 - version.index.value);
			else {
				const branch = useContainerBranch(
					list.get(alternate ? "b0" : `a${split}`),
				);
				alternate = !alternate;
				branch.goto(alternate ? "b0" : `a${split}`);
			}
		}
		function consume() {
			sink +=
				views[0]!.replayPulses.value.length +
				views[1]!.activePath.value.length +
				views[1]!.intervals.value.spans.length +
				(currentMessage(meta.composerDraft)?.content.length ?? 0);
		}
		function check() {
			const expected = pathForTail(list, meta.lastContainerId);
			for (const v of views) {
				assert.deepEqual(
					v.activePath.value.map((c: ChatContainer) => c.id),
					expected.map((c) => c.id),
				);
				assert.deepEqual(
					v.replayGroups.value.map((g: any) => g.version.id),
					project(expected).map((g) => g.version.id),
				);
			}
		}
		return { mutate, consume, check, dirty, handles };
	})!;
	return {
		...result,
		setupMs: performance.now() - started,
		stop: () => scope.stop(),
	};
}
const median = (v: number[]) =>
		v.toSorted((a, b) => a - b)[Math.floor(v.length / 2)]!,
	rows: object[] = [];
console.log(
	`Bun ${Bun.version}; ${cpus()[0]?.model}; real useContainer/useChat/usePathProjection. Rotating strategy order; 5 samples after warmup.`,
);
for (const n of [100, 1000, 10000])
	for (const ratio of process.argv.includes("--positions")
		? [0.1, 0.5, 0.9]
		: [0.9])
		for (const kind of ["version", "branch"] as const) {
			const fixtures = [setup(n, ratio, false), setup(n, ratio, true)],
				samples = fixtures.map(() => ({
					action: [] as number[],
					derive: [] as number[],
					flush: [] as number[],
					total: [] as number[],
				}));
			try {
				for (const f of fixtures) {
					f.check();
					f.mutate("version");
					f.mutate("branch");
					f.check();
					await nextTick();
				}
				for (let round = 0; round < 6; round++)
					for (let offset = 0; offset < 2; offset++) {
						const index = (round + offset) % 2,
							f = fixtures[index]!,
							s = samples[index]!;
						f.dirty.clear();
						const t = performance.now();
						f.mutate(kind);
						const t1 = performance.now();
						f.consume();
						const t2 = performance.now();
						await nextTick();
						const t3 = performance.now();
						assert.equal(f.dirty.size, kind === "branch" ? 2 : 1);
						if (round) {
							s.action.push(t1 - t);
							s.derive.push(t2 - t1);
							s.flush.push(t3 - t2);
							s.total.push(t3 - t);
						}
					}
				for (let i = 0; i < 2; i++) {
					fixtures[i]!.check();
					const s = samples[i]!;
					const row = {
						n,
						retain: ratio,
						kind,
						mode: i ? "id-incremental" : "full",
						handles: fixtures[i]!.handles,
						setup: +fixtures[i]!.setupMs.toFixed(2),
						action: +median(s.action).toFixed(3),
						derive: +median(s.derive).toFixed(3),
						flush: +median(s.flush).toFixed(3),
						total: +median(s.total).toFixed(3),
					};
					rows.push(row);
					console.log(JSON.stringify(row));
				}
			} finally {
				fixtures.forEach((f) => f.stop());
			}
		}
writeFileSync(
	new URL(
		`tmp-path-change-id${process.argv.includes("--all-containers") ? "-all" : ""}${process.argv.includes("--positions") ? "-positions" : ""}-results.json`,
		import.meta.url,
	),
	JSON.stringify(
		{ runtime: Bun.version, cpu: cpus()[0]?.model, rows },
		null,
		2,
	),
);
console.log(
	`Correctness/batch/multi-consumer/dirty-scope checks passed; sink=${sink}. No UI, DB I/O, real timers or stateful Pulse replay.`,
);
