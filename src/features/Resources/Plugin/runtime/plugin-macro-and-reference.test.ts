import { describe, expect, it } from "vitest";
import {
  parseTextPartsWithMacros,
  renderPartsToString,
  resolvePluginChatMacros,
} from "./plugin-macros";
import { createPluginReferenceResolver } from "@/features/Resources/Plugin/runtime/plugin-reference-resolver";
import type { Plugin, PluginFile, PluginFolder } from "@/features/Resources/Plugin/tree/plugin-types";

function file(id: string, name: string, content: string): PluginFile {
  return {
    id,
    name,
    kind: "file",
    content,
    icon: "",
    treeOrder: 0,
    order: 100,
  };
}

function folder(id: string, name: string, children: Array<PluginFile | PluginFolder>): PluginFolder {
  return { id, name, kind: "folder", icon: "", treeOrder: 0, children };
}

function plugin(
  files: Array<PluginFile | PluginFolder>,
  id = "test-plugin",
): Plugin {
  return {
    id,
    packageId: null,
    name: "Test Plugin",
    icon: "",
    shortDescription: "",
    enabled: true,
    builtIn: false,
    root: {
      id: "root",
      name: "",
      kind: "folder",
      icon: "",
      treeOrder: 0,
      children: files,
    },
  };
}

describe("plugin macros", () => {
  it("evaluates multiline conditional expressions", async () => {
    const result = renderPartsToString(await parseTextPartsWithMacros(
      "{{\ntrue? 'a' : 'B'\n}}",
      {},
      { textTruncateLength: Infinity },
      "test-plugin",
    ));

    expect(result).toBe("a");
  });

  it("evaluates multiplication expressions", async () => {
    const result = renderPartsToString(await parseTextPartsWithMacros(
      "{{\n2*1\n}}",
      {},
      { textTruncateLength: Infinity },
      "test-plugin",
    ));

    expect(result).toBe("2");
  });

  it("recovers Markdown-escaped multiplication operators", async () => {
    const result = renderPartsToString(await parseTextPartsWithMacros(
      "{{\n2\\*1\n}}",
      {},
      { textTruncateLength: Infinity },
      "test-plugin",
    ));

    expect(result).toBe("2");
  });

  it("keeps valid JavaScript regular-expression escapes intact", async () => {
    const result = renderPartsToString(await parseTextPartsWithMacros(
      "{{\n/a\\*/.test('a*')\n}}",
      {},
      { textTruncateLength: Infinity },
      "test-plugin",
    ));

    expect(result).toBe("true");
  });

  it("normalizes Milkdown line-break tags before evaluating macros", async () => {
    const result = renderPartsToString(await parseTextPartsWithMacros(
      "{{\n<br />\ntrue? 'a' : 'B'\n<br />\n}}",
      {},
      { textTruncateLength: Infinity },
      "test-plugin",
    ));

    expect(result).toBe("a");
  });

  it("awaits imports before applying post-processing", async () => {
    const result = renderPartsToString(await parseTextPartsWithMacros(
      "{{ (await import('../../../../../src\features\Resources\Plugin\domain\sub.md')).split('').reverse().join('') }}",
      { pluginImport: async (path: string) => path === "./sub.md" ? "Pulsar" : "" },
      { textTruncateLength: Infinity },
      "test-plugin",
    ));

    expect(result).toBe("rasluP");
  });

  it("evaluates container imports from the macro environment", async () => {
    const result = renderPartsToString(await parseTextPartsWithMacros(
      "{{ container.import('after_char') }}",
      { container: { import: (id: string) => id === "after_char" ? "after" : "" } },
      { textTruncateLength: Infinity },
      "test-plugin",
    ));

    expect(result).toBe("after");
  });

  it("resolves chat-resource macros while preserving message roles", async () => {
    const result = await resolvePluginChatMacros({
      message: [
        { role: "system", content: "# Rules" },
        { role: "user", content: "{{ (await import('../../../../../src\features\Resources\Plugin\domain\sub.md')).toUpperCase() }}" },
        { role: "assistant", content: "*Ready*" },
      ],
    }, {
      pluginImport: async (path: string) => path === "./sub.md" ? "pulsar" : "",
    }, "test-plugin");

    expect(result.message).toEqual([
      { role: "system", content: "# Rules" },
      { role: "user", content: "PULSAR" },
      { role: "assistant", content: "*Ready*" },
    ]);
  });

  it("resolves direct imports in chat contexts", () => {
    const chat = file("chat-file", "default.chat.json", JSON.stringify({
      message: [{ role: "system", content: "{{ import('../../../../../src\features\Resources\Plugin\domain\prompt.md') }}" }],
    }));
    const prompt = file("prompt-file", "prompt.md", "Prompt content");
    const resolver = createPluginReferenceResolver([plugin([chat, prompt])]);

    expect(resolver.compileChatContext(chat.id).messages).toEqual([
      { role: "system", content: "Prompt content" },
    ]);
  });

  it("expands split chat macros into their original role messages", async () => {
    const result = await resolvePluginChatMacros({
      message: [{ role: "system", content: "[[ chat ]]" }],
    }, {
      chat: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    }, "test-plugin");

    expect(result.message).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ]);
  });
});

describe("plugin recursive imports", () => {
  it("registers user information and composer commands through global containers", () => {
    const containers = file("containers-file", "containers.json", JSON.stringify({
      containers: [
        { id: "user", title: "用户角色", scope: "global", description: "", contentSuffixes: ["md"] },
        { id: "COMMAND", title: "命令", scope: "global", description: "", contentSuffixes: ["js", "md", "vue"] },
      ],
    }));
    const user = file("user-file", "user.md", "The user is an explorer.");
    user.insertion = { target: "user" };
    const command = file("command-file", "summarize.js", "await reply.setContent(prompt)");
    command.insertion = { target: "COMMAND" };
    const resolver = createPluginReferenceResolver([plugin([containers, user, command])]);
    const userContainer = resolver.listContainers().find((item) => item.name === "user");
    const commandContainer = resolver.listContainers().find((item) => item.name === "COMMAND");

    expect(resolver.getContainer(userContainer!.id)?.contents.map((item) => item.id)).toEqual(["user-file"]);
    expect(resolver.getContainer(commandContainer!.id)?.contents.map((item) => item.id)).toEqual(["command-file"]);
  });

  it("renders a Markdown fixture with multiple macros and nested relative imports", () => {
    const root = file("root-file", "root.md", [
      "# Root **Markdown fixture**",
      "Text with *emphasis*, `inline code`, and a [link](https://example.com).",
      "",
      "{{ 2*3 }}",
      "{{ 'root:' + 1 }}",
      "{{ import('../../../../../src\features\Resources\Plugin\domain\sub.md') }}",
    ].join("\n"));
    const sub = file("sub-file", "sub.md", [
      "## Sub",
      "> A quote with **bold text**.",
      "{{ ['sub', 2].join('-') }}",
      "{{ import('../../../../../src\features\Resources\Plugin\domain\nested.md') }}",
    ].join("\n"));
    const nested = file("nested-file", "nested.md", [
      "### Nested",
      "- `#` is literal code",
      "- *emphasized list text*",
      "{{ true ? 'done' : 'never' }}",
    ].join("\n"));
    const resolver = createPluginReferenceResolver([plugin([
      folder("fixtures", "fixtures", [root, sub, nested]),
    ])]);

    const result = resolver.renderResource(root.id);

    expect(result).toContain("# Root **Markdown fixture**");
    expect(result).toContain("Text with *emphasis*, `inline code`");
    expect(result).toContain("6");
    expect(result).toContain("root:1");
    expect(result).toContain("## Sub");
    expect(result).toContain("sub-2");
    expect(result).toContain("### Nested");
    expect(result).toContain("done");
  });

  it("allows post-processing after an awaited recursive import", () => {
    const root = file(
      "root-file",
      "root.md",
      "{{ (await import('../../../../../src\features\Resources\Plugin\domain\sub.md')).split('').reverse().join('') }}",
    );
    const sub = file("sub-file", "sub.md", "Pulsar");
    const resolver = createPluginReferenceResolver([plugin([
      folder("fixtures", "fixtures", [root, sub]),
    ])]);

    expect(resolver.renderResource(root.id)).toBe("rasluP");
  });

  it("expands nested resource imports using the importing file as context", () => {
    const root = file("root-file", "root.md", "root {{ import('../../../../../src\features\Resources\Plugin\domain\child.md') }}");
    const child = file("child-file", "child.md", "child {{ import('@/leaf.md') }}");
    const leaf = file("leaf-file", "leaf.md", "leaf");
    const resolver = createPluginReferenceResolver([plugin([
      folder("docs", "docs", [root, child]),
      leaf,
    ])]);

    expect(resolver.renderResource(root.id)).toBe("root child leaf");
  });

  it("resolves a resource from another plugin by its URI plugin ID", () => {
    const root = file("root-file", "root.md", "{{ import('@shared/value.md') }}");
    const value = file("value-file", "value.md", "shared value");
    const resolver = createPluginReferenceResolver([
      plugin([root]),
      plugin([value], "shared"),
    ]);

    expect(resolver.renderResource(root.id)).toBe("shared value");
  });

  it("reads local and global manifest configuration from a macro", () => {
    const root = file(
      "root-file",
      "prompt.md",
      "{{ config.get('writing', 'prefix') }} / {{ config.get('shared', 'writing', 'suffix') }}",
    );
    const manifest = file("local-manifest", "manifest.json", JSON.stringify([
      {
        group: { id: "writing", title: "Writing" },
        content: [{
          id: "prefix",
          title: "Prefix",
          component: "Input",
          value: "Local",
        }],
      },
    ]));
    const sharedManifest = file("shared-manifest", "manifest.json", JSON.stringify([
      {
        group: { id: "writing", title: "Writing" },
        content: [{
          id: "suffix",
          title: "Suffix",
          component: "Input",
          value: "Global",
        }],
      },
    ]));
    const resolver = createPluginReferenceResolver([
      plugin([root, manifest]),
      plugin([sharedManifest], "shared"),
    ]);

    expect(resolver.renderResource(root.id)).toBe("Local / Global");
  });

  it("hydrates an imported data facade with its source-resource override", () => {
    const root = file(
      "root-file",
      "prompt.md",
      "{{ import('../../../../../src\features\Resources\Plugin\domain\state.data.json').label }}: {{ import('../../../../../src\features\Resources\Plugin\domain\state.data.json').count }}",
    );
    const data = file("state-file", "state.data.json", JSON.stringify({
      version: 1,
      isolation: "resource",
      description: "Test state",
      initialValue: { name: "default", count: 1 },
      enableUpdater: false,
      wrapperSource: "(value) => ({ label: value.name.toUpperCase(), count: value.count })",
    }));
    const resolver = createPluginReferenceResolver([plugin([root, data])], {
      dataOverrides: {
        "data:state-file:resource:root-file": { name: "lyra", count: 3 },
      },
    });

    expect(resolver.renderResource(root.id)).toBe("LYRA: 3");
  });

  it("reports the complete resource path when imports recurse", () => {
    const first = file("first-file", "first.md", "{{ import('@/second.md') }}");
    const second = file("second-file", "second.md", "{{ import('@/first.md') }}");
    const resolver = createPluginReferenceResolver([plugin([first, second])]);

    expect(() => resolver.renderResource(first.id)).toThrow(
      "检测到引用循环：first.md -> second.md -> first.md",
    );
  });

  it("filters container contents by selection mode and exports container path array API", () => {
    const containers = file("containers-file", "containers.json", JSON.stringify({
      containers: [
        {
          id: "background",
          title: "背景",
          scope: "global",
          description: "",
          contentSuffixes: ["media"],
          selectionMode: "single",
          overrideStrategy: "override",
          selectedPaths: ["background/classroom.png"],
        },
      ],
    }));
    const bg1 = file("bg1-file", "background/classroom.png", "image1");
    bg1.insertion = { target: "background" };
    const bg2 = file("bg2-file", "background/park.png", "image2");
    bg2.insertion = { target: "background" };

    const resolver = createPluginReferenceResolver([plugin([containers, bg1, bg2])]);
    const bgContainer = resolver.listContainers().find((c) => c.name === "background");
    expect(bgContainer).toBeDefined();

    const readRes = resolver.readContainer(bgContainer!.id);
    expect(readRes.contents.map((item) => item.path)).toEqual(["/background/classroom.png"]);

    const pathsRes = resolver.readContainerPaths(bgContainer!.id);
    expect(pathsRes).toEqual(["/background/classroom.png"]);
  });
});
