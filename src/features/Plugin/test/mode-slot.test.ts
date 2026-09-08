import { describe, expect, it } from "vitest";
import { parsePluginModes } from "../runtime/mode-slot";
import type { WorldResource } from "../tree/world-store";

function resource(content: string): WorldResource {
	return {
		scope: "self",
		path: "/self/modes/review.json",
		displayPath: "/self/modes/review.json",
		sourceName: "test",
		nodePath: ["modes", "review"],
		file: {
			type: "file",
			id: "review-mode",
			name: "review.json",
			content,
			resourceSelected: true,
			priority: 100,
			treeOrder: 0,
			createDate: "2026-01-01T00:00:00.000Z",
			updateDate: "2026-01-01T00:00:00.000Z",
		},
	};
}

describe("MODE slot parser", () => {
	it("reads mode metadata and script paths", () => {
		expect(
			parsePluginModes([
				resource(
					JSON.stringify({
						id: "review",
						name: "审阅",
						enter: "/self/modes/review-enter.js",
						exit: "/self/modes/review-exit.js",
					}),
				),
			]),
		).toEqual([
			expect.objectContaining({
				id: "review",
				name: "审阅",
				enter: "/self/modes/review-enter.js",
				exit: "/self/modes/review-exit.js",
			}),
		]);
	});

	it("ignores invalid JSON", () => {
		expect(parsePluginModes([resource("{")])).toEqual([]);
	});
});
