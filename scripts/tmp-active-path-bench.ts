// Temporary CPU benchmark: bun scripts/tmp-active-path-bench.ts
// No database, UI, persistence or actual Pulse replay is included.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computed, reactive, ref } from "vue";
import type { ChatContainer } from "../src/features/Conversation/dataflow/types";

// Execute the actual helpers without loading their unrelated native/media imports.
const source = readFileSync(new URL("../src/features/Conversation/dataflow/activePathComposable/message-service.ts", import.meta.url), "utf8");
const helpers = source.slice(source.indexOf("export function currentMessage("), source.indexOf("export async function modelMessagesFromPath("));
assert(helpers.includes("export function pathForTail("));
const js = new Bun.Transpiler({ loader: "ts" }).transformSync(helpers).replaceAll("export ", "");
const { currentMessage, pathForTail } = new Function(`${js}; return { currentMessage, pathForTail };`)() as typeof import("../src/features/Conversation/dataflow/activePathComposable/message-service");

const group = (container: ChatContainer) => {
	const version = currentMessage(container);
	return version ? [{ container, version, pulses: version.meta.pulses ?? [] }] : [];
};
const groups = (path: ChatContainer[]) => path.flatMap(group);
let sink = 0;
function measure(label: string, run: () => unknown[]) {
	for (let i = 0; i < 30; i++) sink += run().length;
	const samples: number[] = [];
	for (let round = 0; round < 7; round++) {
		const start = performance.now();
		let count = 0;
		do { sink += run().length; count++; } while (performance.now() - start < 30);
		samples.push((performance.now() - start) / count);
	}
	samples.sort((a, b) => a - b);
	console.log(`${label.padEnd(39)} ${samples[3]!.toFixed(4)} ms/op (median of 7 batches)`);
}

function fixture(n: number, split: number) {
	const make = (id: string, previous: string | null): ChatContainer => ({
		id, conversationid: "bench", role: "user", previousContainer: previous,
		activeNextContainer: null, availableNextContainer: [], activeMessage: 0,
		content: [0, 1].map(v => ({ id: `${id}-v${v}`, type: "message", content: "text", createdAt: "", meta: { steps: [], pulses: [] } })),
	});
	const path = Array.from({ length: n }, (_, i) => make(`a${i}`, i ? `a${i - 1}` : null));
	const suffix = Array.from({ length: n - split }, (_, i) => make(`b${i}`, i ? `b${i - 1}` : split ? `a${split - 1}` : null));
	const all = new Set([...path, ...suffix]);
	return { path, suffix, all, byId: new Map([...all].map(c => [c.id, c])) };
}

function backwards(byId: Map<string, ChatContainer>, tail: string, stop?: string) {
	const result: ChatContainer[] = [];
	const seen = new Set<string>();
	let item = byId.get(tail);
	while (item && item.id !== stop && !seen.has(item.id)) {
		seen.add(item.id); result.push(item);
		item = item.previousContainer ? byId.get(item.previousContainer) : undefined;
	}
	return result.reverse();
}

console.log(`Bun ${Bun.version}; ${process.platform}/${process.arch}; timings include allocations; maintained Map setup excluded.`);
for (const n of [100, 1000, 10000]) {
	console.log(`\nActive path: ${n} containers, 2 versions/container`);
	const f = fixture(n, Math.floor(n / 2));
	assert.deepEqual(pathForTail(f.byId, f.path.at(-1)!.id), f.path);
	assert.deepEqual(backwards(f.byId, f.path.at(-1)!.id), f.path);
	measure("plain: actual pathForTail", () => pathForTail(f.byId, f.path.at(-1)!.id));
	measure("plain: Map rebuild + push/reverse", () => backwards(new Map([...f.all].map(c => [c.id, c])), f.path.at(-1)!.id));
	measure("plain: full replayGroups projection", () => groups(f.path));

	// Reproduce Vue dependencies of activePath/replayGroups, without the DB store.
	const all = reactive(f.byId);
	const tail = ref(f.path.at(-1)!.id);
	let pathRuns = 0;
	const active = computed(() => { pathRuns++; return pathForTail(all, tail.value); });
	const replay = computed(() => groups(active.value));
	replay.value;
	const target = active.value[Math.floor(n / 2)]!;
	const initialRuns = pathRuns;
	target.activeMessage = 1;
	assert.equal(replay.value[Math.floor(n / 2)]!.version, currentMessage(target));
	assert.equal(pathRuns, initialRuns, "version changes must not recalculate activePath");
	measure("Vue: version switch + full groups", () => { target.activeMessage = 1 - target.activeMessage!; return replay.value; });
	let replaySnapshot = replay.value;
	target.activeMessage = 1 - target.activeMessage!;
	const replaced = replaySnapshot.slice();
	replaced[Math.floor(n / 2)] = group(target)[0]!;
	assert.deepEqual(replaced, replay.value);
	replaySnapshot = replaced;
	measure("Vue: version switch + copy/replace", () => {
		target.activeMessage = 1 - target.activeMessage!;
		const next = replaySnapshot.slice();
		next[Math.floor(n / 2)] = group(target)[0]!;
		replaySnapshot = next;
		return next;
	});
	function switchTail() { tail.value = tail.value === f.path.at(-1)!.id ? f.suffix.at(-1)!.id : f.path.at(-1)!.id; }
	// Both branches have the same length. Immutable publication copies the retained prefix.
	measure("Vue: branch switch + full path/groups", () => { switchTail(); return replay.value; });
	const fastReplay = computed(() => groups(backwards(new Map(all), tail.value)));
	measure("Vue: branch Map rebuild/push/reverse", () => { switchTail(); return fastReplay.value; });
	console.log(`  version-switch dependency assertion passed (${initialRuns} path evaluation before switch)`);

	for (const ratio of [0.1, 0.5, 0.9]) {
		const split = Math.floor(n * ratio);
		const b = fixture(n, split);
		const old = groups(b.path);
		const expected = groups(pathForTail(b.byId, b.suffix.at(-1)!.id));
		const incremental = () => old.slice(0, split).concat(groups(backwards(b.byId, b.suffix.at(-1)!.id, b.path[split - 1]?.id)));
		assert.deepEqual(incremental(), expected);
		measure(`plain: suffix groups, retain ${ratio * 100}%`, incremental);
		const reactiveMap = new Map([...reactive(b.all)].map(c => [c.id, c]));
		let cached = groups(b.path.map(c => reactiveMap.get(c.id)!));
		let useAlternate = false;
		const incrementalVue = () => {
			useAlternate = !useAlternate;
			const nextTail = (useAlternate ? b.suffix : b.path).at(-1)!.id;
			cached = cached.slice(0, split).concat(groups(backwards(reactiveMap, nextTail, b.path[split - 1]?.id)));
			return cached;
		};
		assert.deepEqual(incrementalVue(), groups(pathForTail(reactive(b.byId), b.suffix.at(-1)!.id)));
		measure(`Vue proxies: suffix, retain ${ratio * 100}%`, incrementalVue);
	}
}
console.log(`\nChecks passed; sink=${sink}. This measures path/group preparation, not replaying stateful Pulses.`);
