import { computed, ref, watch, onUnmounted, toValue, type ComputedRef, type Ref, type MaybeRefOrGetter } from "vue";
import { spring } from "../lib/springs";
import type { ItemRect } from "./use-proximity-hover";

// Edge spring for the selected-bg merge/split: spring.moderate (critically
// damped) so converging edges meet exactly instead of overshooting. On a merge
// the inner corners trail by `cornerDelay`, staying rounded until the halves meet.
export const mergeSpring = spring.moderate;
export const cornerDelay = 0.07;
// A boundary resolves after its motion finishes (merge → swap to one block;
// split → drop), driven by a duration timer rather than onAnimationComplete —
// motion skips that callback when an animation's target equals its current value
// (which spam-toggling produces), which would otherwise strand a half. The
// buffer biases late, by which point the halves have met/parted, so it's unseen.
const convergeMs = (mergeSpring.duration + cornerDelay) * 1000 + 80;
const splitMs = mergeSpring.duration * 1000 + 80;

// A selected-background block for one render. A run is normally one block; mid
// merge/split it is drawn as two abutting halves with sharp inner corners.
type Rect = { top: number; left: number; width: number; height: number };
export interface SelBlock extends Rect {
  key: string;
  radii: [number, number, number, number]; // tl, tr, br, bl
  instant: boolean; // skip the spring (the zero-shift swap, the split snap-in)
  exitInstant: boolean; // drop without the fade (absorbed half at the swap)
  delayCorners: boolean; // trail the corner straightening (merge converge)
  cornerDelay?: number; // optional per-block delay override
  opacity?: number; // override the hover-derived opacity (commit ghost = 0)
  // State a fresh block animates *from* on mount, so it springs into place
  // instead of snapping when continuity is lost (fast toggling) or the block is
  // inherently new (a split's lower half). Continuous blocks ignore it.
  enterFrom?: { top: number; height: number; radii: [number, number, number, number] };
}

// A contiguous run of selected/checked rows, with a stable id so motion can
// morph it across renders rather than exit+re-enter.
export type Run = { start: number; end: number; id: number };

/**
 * Groups checked row indices into contiguous runs with ids that survive
 * updates: a run keeps its id while any of its rows was in a run previously,
 * so motion morphs a growing/shrinking block instead of swapping it.
 */
export function useSelectionRuns(checkedIndices: MaybeRefOrGetter<readonly number[]>): ComputedRef<Run[]> {
  let prevGroupMap = new Map<number, number>();
  let groupIdCounter = 0;

  return computed(() => {
    const indices = toValue(checkedIndices) ?? [];
    const runs: { start: number; end: number }[] = [];
    const sorted = [...indices].sort((a, b) => a - b);
    for (const idx of sorted) {
      const last = runs[runs.length - 1];
      if (last && idx === last.end + 1) last.end = idx;
      else runs.push({ start: idx, end: idx });
    }

    const usedIds = new Set<number>();
    const nextGroupMap = new Map<number, number>();
    const result = runs.map((run) => {
      let stableId: number | null = null;
      for (let i = run.start; i <= run.end; i++) {
        const prevId = prevGroupMap.get(i);
        if (prevId !== undefined && !usedIds.has(prevId)) {
          stableId = prevId;
          break;
        }
      }
      const id = stableId ?? ++groupIdCounter;
      usedIds.add(id);
      for (let i = run.start; i <= run.end; i++) nextGroupMap.set(i, id);
      return { ...run, id };
    });
    prevGroupMap = nextGroupMap;
    return result;
  });
}

// One in-flight merge or split; geometry is recomputed from the live runs each
// render so rapid toggles redirect instead of freezing.
interface Boundary {
  tid: number;
  kind: "merge" | "split";
  survivorId: number; // persisting run (merged run / split's upper run)
  otherId: number; // merge: absorbed run; split: new lower run
  gapIndex: number; // bridging/deselected row — where the halves meet
  phase: "converge" | "commit" | "splitIn" | "diverge";
}

// Two runs within `outer`, ordered, separated by exactly one row (a single-row
// bridge — the only shape a click can merge or split).
function bridgePair(outer: Run, runs: Run[]) {
  const inside = runs
    .filter((r) => r.start >= outer.start && r.end <= outer.end)
    .sort((a, b) => a.start - b.start);
  if (inside.length !== 2) return null;
  const [up, lo] = inside;
  return lo.start === up.end + 2 ? { up, lo, gap: up.end + 1 } : null;
}

/**
 * ── Merge / split 边界动画 ─────────────────────────────
 * 当一个未选中的行桥接两段选中区间时，两段的内缘滑向桥接行的中点
 * （朝内的角拉直到尖角），然后无可见运动地换成一块——而不是让存留块
 * 弹簧式地长成整个并集。取消选中中间一行时播放反向动画：先吸附成两个
 * 相邻的半块，再滑开。
 *
 * 给定连续选中的 `runs`（带稳定 id）、测量好的 `itemRects`，
 * 以及要圆整到的角半径 `R`，返回要绘制的背景块列表——每个 run 一块，
 * 处于 merge/split 中的 run 则是两个相邻的半块。用 <SelectionBackgrounds>
 * 渲染。
 */
export function useMergeSplitBlocks(
  runs: Ref<Run[]>,
  itemRects: Ref<ItemRect[]>,
  R: number
): ComputedRef<SelBlock[]> {
  const boundaries = ref<Boundary[]>([]);
  let prevRuns: Run[] = [];
  let tid = 0;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();

  const runsSig = computed(() =>
    runs.value.map((g) => `${g.id}:${g.start}-${g.end}`).join("|")
  );

  // Detect merges/splits before paint (so the first frame already shows the
  // halves) and drop any boundary the latest selection invalidated (e.g. the
  // bridge row was toggled again mid-flight).
  watch(
    runsSig,
    () => {
      const cur = runs.value;
      const found: Boundary[] = [];
      for (const c of cur) {
        const p = bridgePair(c, prevRuns); // two prev runs collapsed into one
        if (p && (c.id === p.up.id || c.id === p.lo.id))
          found.push({
            tid: ++tid,
            kind: "merge",
            survivorId: c.id,
            otherId: c.id === p.up.id ? p.lo.id : p.up.id,
            gapIndex: p.gap,
            phase: "converge",
          });
      }
      for (const p of prevRuns) {
        const c = bridgePair(p, cur); // one prev run split into two
        if (c)
          found.push({
            tid: ++tid,
            kind: "split",
            survivorId: c.up.id,
            otherId: c.lo.id,
            gapIndex: c.gap,
            phase: "splitIn",
          });
      }
      prevRuns = cur.map((r) => ({ ...r }));
      // Resolve each new boundary after its motion window (merge → swap to one
      // block; split → drop), so an interrupted animation can't strand a half.
      for (const b of found) {
        timers.set(
          b.tid,
          setTimeout(() => {
            timers.delete(b.tid);
            boundaries.value = boundaries.value.some((x) => x.tid === b.tid)
              ? boundaries.value.flatMap((x) =>
                  x.tid !== b.tid
                    ? [x]
                    : x.kind === "merge"
                      ? [{ ...x, phase: "commit" as const }]
                      : []
                )
              : boundaries.value;
          }, b.kind === "merge" ? convergeMs : splitMs)
        );
      }
      const stillValid = (b: Boundary) =>
        b.kind === "merge"
          ? cur.some(
              (c) =>
                c.id === b.survivorId &&
                b.gapIndex > c.start &&
                b.gapIndex < c.end
            )
          : cur.some((c) => c.id === b.survivorId && c.end === b.gapIndex - 1) &&
            cur.some((c) => c.id === b.otherId && c.start === b.gapIndex + 1);
      // Cancel the resolve timer of any boundary the latest selection
      // invalidated — otherwise it sits in `timers` until firing as a no-op.
      for (const b of boundaries.value) {
        if (stillValid(b)) continue;
        const timer = timers.get(b.tid);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(b.tid);
        }
      }
      boundaries.value = [...boundaries.value.filter(stillValid), ...found];
    },
    { flush: "post" }
  );

  // Clear any pending timers on unmount.
  onUnmounted(() => {
    timers.forEach(clearTimeout);
    timers.clear();
  });

  // Follow-up render: a fresh split holds its abutting frame once then
  // diverges; a committed merge is dropped.
  watch(
    boundaries,
    (bs) => {
      if (!bs.some((b) => b.phase === "splitIn" || b.phase === "commit")) return;
      boundaries.value = bs.flatMap((b) =>
        b.phase === "commit"
          ? []
          : [{ ...b, phase: b.phase === "splitIn" ? "diverge" as const : b.phase }]
      );
    },
    { flush: "post" }
  );

  // Build the blocks to paint: one per run, overridden into abutting halves for
  // any run in an in-flight boundary.
  return computed<SelBlock[]>(() => {
    const cur = runs.value;
    const rects = itemRects.value;
    const rectOf = (start: number, end: number): Rect | null => {
      const s = rects[start];
      const e = rects[end];
      if (!s || !e) return null;
      return {
        top: s.top,
        left: Math.min(s.left, e.left),
        width: Math.max(s.width, e.width),
        height: e.top + e.height - s.top,
      };
    };
    const blocks: SelBlock[] = [];
    for (const run of cur) {
      const r = rectOf(run.start, run.end);
      if (r)
        blocks.push({
          key: `sel-${run.id}`,
          ...r,
          radii: [R, R, R, R],
          instant: false,
          exitInstant: false,
          delayCorners: false,
        });
    }
    const byId = new Map(blocks.map((b) => [b.key, b]));
    for (const b of boundaries.value) {
      const gap = rects[b.gapIndex];
      const sv = byId.get(`sel-${b.survivorId}`);
      if (!gap || !sv) continue;
      const midY = gap.top + gap.height / 2;
      if (b.kind === "merge") {
        if (b.phase === "commit") {
          // Zero-shift swap: survivor jumps to the full union (already covered
          // by its top half + the absorbed bottom half). The absorbed half is
          // held one render at opacity 0 so removing it next render can't flash
          // a one-frame overlap with the now-full survivor.
          sv.instant = true;
          blocks.push({
            key: `sel-${b.otherId}`,
            top: midY,
            left: sv.left,
            width: sv.width,
            height: sv.top + sv.height - midY,
            radii: [0, 0, R, R],
            instant: true,
            exitInstant: true,
            delayCorners: false,
            opacity: 0,
          });
          continue;
        }
        // converge: survivor → top half, absorbed run → bottom-half ghost,
        // inner corners straightening to sharp.
        // Slightly trail lower merges while keeping a baseline and small cap.
        const mergeCornerDelay = Math.min(
          cornerDelay + 0.03,
          Math.max(cornerDelay, cornerDelay + (midY / Math.max(gap.height, 1)) * 0.002)
        );
        const bottom = sv.top + sv.height;
        sv.height = midY - sv.top;
        sv.radii = [R, R, 0, 0];
        sv.delayCorners = true;
        sv.cornerDelay = mergeCornerDelay;
        blocks.push({
          key: `sel-${b.otherId}`,
          top: midY,
          left: sv.left,
          width: sv.width,
          height: bottom - midY,
          radii: [0, 0, R, R],
          // Mount at full corners so a fresh ghost still animates the
          // straightening with the same delay as the survivor.
          enterFrom: { top: midY, height: bottom - midY, radii: [R, R, R, R] },
          instant: false,
          exitInstant: true,
          delayCorners: true,
          cornerDelay: mergeCornerDelay,
        });
      } else if (b.phase === "splitIn") {
        const lo = byId.get(`sel-${b.otherId}`);
        if (!lo) continue;
        // Pin both halves at the seam (identical to the single block); the
        // diverge render then springs them to their real rects.
        const bottom = lo.top + lo.height;
        sv.height = midY - sv.top;
        sv.radii = [R, R, 0, 0];
        sv.instant = true;
        lo.top = midY;
        lo.height = bottom - midY;
        lo.radii = [0, 0, R, R];
        lo.instant = true;
        lo.enterFrom = { top: midY, height: bottom - midY, radii: [0, 0, R, R] };
      }
      // diverge: nothing to override — the steady blocks spring to their real
      // rects from the seam; the timer drops the boundary.
    }

    // Split safety net, pinned synchronously. The split boundary above is
    // created in a watcher that runs *after* this computation, so on the very
    // frame a split first appears its fresh lower half would mount at its final
    // rect and snap. Detecting the split here (previous runs vs current) and
    // pinning both halves at the seam guarantees the lower mounts on the seam
    // regardless of render/paint timing (the cause of the rapid-toggle snap).
    for (const p of prevRuns) {
      const c = bridgePair(p, cur);
      const gap = c && rects[c.gap];
      if (!c || !gap) continue;
      const midY = gap.top + gap.height / 2;
      const up = byId.get(`sel-${c.up.id}`);
      const lo = byId.get(`sel-${c.lo.id}`);
      if (!up || !lo) continue;
      const bottom = lo.top + lo.height;
      up.height = midY - up.top;
      up.radii = [R, R, 0, 0];
      up.instant = true;
      lo.top = midY;
      lo.height = bottom - midY;
      lo.radii = [0, 0, R, R];
      lo.instant = true;
      lo.enterFrom = { top: midY, height: bottom - midY, radii: [0, 0, R, R] };
    }

    return blocks;
  });
}
