import type { InteractiveDocumentData } from "../domain/interactive-document";

export function createInteractiveDocumentDemo(): InteractiveDocumentData {
  return {
    id: "interactive-document-demo",
    name: "调查员角色模板",
    description: "文本版本、变量和外部组件共同编译为纯 Markdown。",
    blocks: [
      {
        id: "profile",
        type: "variable",
        name: "profile",
        description: "角色的基本结构，可在模板中通过 profile 访问。",
        hidden: false,
        rendererId: "json",
        value: {
          name: "星野",
          role: "异常事件调查员",
          tone: "克制、敏锐",
        },
      },
      {
        id: "topics",
        type: "variable",
        name: "topics",
        description: "当前角色应优先关注的主题。",
        hidden: false,
        rendererId: "list",
        value: ["现场线索", "证词矛盾", "未解释的时间差"],
      },
      {
        id: "identity-template",
        type: "text",
        name: "身份模板",
        description: "切换版本可以替换整段角色定义。",
        hidden: false,
        activeContentIndex: 0,
        variableIds: ["profile", "topics"],
        content: [
          "# {{profile.name}}\n\n你是一名{{profile.role}}，表达方式应保持{{profile.tone}}。\n\n## 调查重点\n\n{{topics}}",
          "# {{profile.name}}的记录\n\n以{{profile.role}}的身份整理信息。先列事实，再标记冲突，不对未知部分做无依据推断。\n\n{{topics}}",
        ],
      },
      {
        id: "session-note",
        type: "component",
        name: "会话备注组件",
        description: "引用外部组件，并在无组件解析器时使用 Markdown 回退。",
        hidden: false,
        componentId: "builtin/session-note",
        props: {
          title: "本轮目标",
          compact: true,
        },
        fallbackMarkdown: "> **本轮目标**：围绕 {{profile.name}} 的调查重点组织上下文。",
      },
    ],
  };
}
