import { describe, expect, it } from "vitest";
import {
	buildStImportPlan,
	tryBuildStImportPlan,
} from "@/features/Migrations/SillyTavern/import/st-import-plan";

/** 构造一个带 chara tEXt 文本块的最小 PNG（解析器不校验 CRC）。 */
function pngWithChara(json: string): string {
	const chunk = (type: string, data: number[]) => {
		const length = data.length;
		return [
			(length >>> 24) & 0xff,
			(length >>> 16) & 0xff,
			(length >>> 8) & 0xff,
			length & 0xff,
			...Array.from(type, (char) => char.charCodeAt(0)),
			...data,
			0, 0, 0, 0,
		];
	};
	const payload = Buffer.from(json).toString("base64");
	const textData = [
		...Array.from("chara", (char) => char.charCodeAt(0)),
		0,
		...Array.from(payload, (char) => char.charCodeAt(0)),
	];
	const png = [
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
		...chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
		...chunk("tEXt", textData),
		...chunk("IEND", []),
	];
	return Buffer.from(png).toString("base64");
}

describe("buildStImportPlan", () => {
	it("only converts positively identified ST files", () => {
		expect(
			tryBuildStImportPlan("notes.md", { text: "普通 Markdown" }),
		).toBeUndefined();
		expect(
			tryBuildStImportPlan("config.json", {
				text: JSON.stringify({ description: "普通 JSON" }),
			}),
		).toBeUndefined();
	});

	it("classifies a worldbook json into per-entry markdown files", () => {
		const plan = buildStImportPlan(" demo-book.json", {
			text: JSON.stringify({
				entries: {
					"0": {
						uid: 0,
						comment: "设定：城市",
						content: "这座城市建立在废墟之上。",
						key: ["城市"],
						position: 0,
						order: 42,
						disable: false,
					},
					"1": {
						uid: 1,
						comment: "恒定条目",
						content: "世界的底层规则。",
						constant: true,
						position: 1,
						disable: true,
					},
				},
			}),
		});

		expect(plan.kind).toBe("worldbook");
		expect(plan.name).toBe("demo-book");
		expect(plan.mode).toBe("folder");
		expect(plan.files).toHaveLength(2);
		const [first, second] = plan.files;
		expect(first?.path).toBe("lorebooks/001-设定：城市.md");
		expect(first?.slotId).toBe("before_char");
		expect(first?.condition).toContain("include(");
		expect(first?.resourceSelected).toBe(true);
		expect(first?.priority).toBe(42);
		expect(second?.resourceSelected).toBe(false);
		expect(second?.slotId).toBe("after_char");
	});

	it("classifies a character card and produces info/lorebooks/regex files", () => {
		const plan = buildStImportPlan("azure-sky.png", {
			base64: pngWithChara(
				JSON.stringify({
					spec: "chara_card_v2",
					data: {
						name: "蔚空",
						description: "一个测试角色 {{char}}。",
						personality: "冷静",
						first_mes: "你好。",
						character_book: {
							entries: [
								{
									uid: 0,
									comment: "秘密",
									content: "她藏着一个秘密。",
									key: ["秘密"],
									position: 4,
									depth: 2,
								},
							],
						},
					},
				}),
			),
			mediaType: "image/png",
		});

		expect(plan.kind).toBe("character");
		expect(plan.name).toBe("azure-sky");
		expect(plan.character?.name).toBe("蔚空");
		expect(plan.character?.description).toBe("一个测试角色 {{char}}。");
		expect(plan.character?.iconDataUrl).toContain("data:image/png;base64,");
		const info = plan.files.find((file) => file.path === "info.md");
		expect(info?.slotId).toBe("character");
		expect(String(info?.content)).toContain("## 开场白");
		expect(String(info?.content)).toContain("你好。");
		const lorebook = plan.files.find((file) => file.path.startsWith("lorebooks/"));
		expect(lorebook?.slotId).toBe("depth:2");
		expect(lorebook?.resourceSelected).toBe(true);
	});

	it("classifies a regex json into a single regex.json file", () => {
		const plan = buildStImportPlan("my-regex.json", {
			text: JSON.stringify([
				{
					findRegex: "/foo/g",
					replaceString: "bar",
					placement: [1, 2],
					disabled: false,
				},
			]),
		});
		expect(plan.kind).toBe("regex");
		expect(plan.mode).toBe("file");
		expect(plan.files[0]?.path).toBe("regex.json");
		expect(plan.files[0]?.slotId).toBe("REGEX");
	});

	it("treats a markdown file as a user persona", () => {
		const plan = buildStImportPlan("我的Persona.md", {
			text: "我是测试用户 {{user}}。",
		});
		expect(plan.kind).toBe("persona");
		expect(plan.mode).toBe("file");
		expect(plan.files[0]?.path).toBe("我的Persona.md");
		expect(plan.files[0]?.slotId).toBe("user");
	});

	it("classifies an openai preset into entry.chat.json", () => {
		const plan = buildStImportPlan("alpha-preset.json", {
			text: JSON.stringify({
				temperature: 0.7,
				prompts: [
					{ identifier: "main", name: "主提示", role: "system", content: "你是一个助手。", injection_position: 0 },
				],
				story_string: "历史背景：{{description}}",
			}),
		});
		expect(plan.kind).toBe("preset");
		const entry = plan.files.find((file) => file.path === "entry.chat.json");
		expect(entry?.slotId).toBe("chat");
		expect((entry?.content as { message: unknown[] }).message.length).toBeGreaterThan(0);
	});
});
