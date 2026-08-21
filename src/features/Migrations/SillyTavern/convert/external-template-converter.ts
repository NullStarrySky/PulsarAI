export interface ExternalTemplateContext {
  characterFileName: string;
  userName?: string;
  character?: Record<string, string | string[]>;
}

export interface ExternalTemplateIssue {
  syntax: "sillytavern-macro" | "st-prompt-template-ejs";
  name: string;
  reason: string;
}

export interface ExternalTemplateConversion {
  text: string;
  issues: ExternalTemplateIssue[];
}

interface MacroToken {
  start: number;
  end: number;
  raw: string;
  body: string;
  nested: boolean;
}

const unsupportedEjsRuntime = new Map<string, string>([
  ["await", "PulsarAI 的 Markdown/Chat 动态表达式是同步求值，不能等待异步 EJS。"],
  ["include", "EJS include 没有可验证的模板根路径；应改用 import() 显式引用。"],
  ["SillyTavern", "不向 PulsarAI 执行层注入 SillyTavern API 兼容对象。"],
  ["TavernHelper", "不向 PulsarAI 执行层注入 TavernHelper API。"],
  ["getwi", "世界书读取必须改用来源作用域内的 imports() / slot.import()。"],
  ["getWorldInfo", "世界书读取必须改用来源作用域内的 imports() / slot.import()。"],
  ["getchat", "聊天访问应使用当前 Sandbox 的 chat/activePath，无法保持原扩展调用契约。"],
  ["getChatMessages", "聊天访问应使用当前 Sandbox 的 chat/activePath，无法保持原扩展调用契约。"],
  ["getchar", "角色资源查询缺少与原扩展相同的角色数据库和模板契约。"],
  ["inject", "任意注入事件不能映射为一个稳定的 Plugin 容器位置。"],
  ["getPromptsInjected", "PulsarAI 没有 SillyTavern PromptManager 注入表。"],
  ["eventSource", "不会复制 SillyTavern 通用事件总线。"],
  ["document", "模板不得依赖 SillyTavern DOM。"],
  ["window", "模板不得依赖 SillyTavern 页面全局对象。"],
  ["jQuery", "模板不得依赖 SillyTavern/jQuery UI。"],
  ["toastr", "模板渲染不负责 UI 通知。"],
  ["fetch", "迁移模板不得通过网络补齐外部状态。"],
  ["WebSocket", "迁移模板不得建立外部网络连接。"],
  ["XMLHttpRequest", "迁移模板不得建立外部网络连接。"],
  ["EventSource", "迁移模板不得建立外部事件连接。"],
  ["Worker", "迁移模板不得创建脱离生成生命周期的 Worker。"],
  ["eval", "不允许迁移模板再次执行动态代码生成。"],
  ["Function", "不允许迁移模板再次执行动态代码生成。"],
  ["import", "EJS 模板不能动态加载模块；资源必须通过 Plugin imports 显式声明。"],
  ["require", "EJS 模板不能加载 Node/CommonJS 模块。"],
  ["localStorage", "模板只能通过生成的 getvar/setvar 命名空间访问存储。"],
  ["capabilities", "外部 EJS 不能直接取得 PulsarAI Feature API。"],
  ["runProcess", "外部 EJS 不能启动 Plugin 流程。"],
  ["agent", "外部 EJS 不能直接调用 Agent。"],
  ["skills", "外部 EJS 不能直接调用 Skill。"],
  ["mcp", "外部 EJS 不能直接调用 MCP。"],
]);

/**
 * Shared import-time boundary for foreign prompt syntaxes. The output contains
 * only PulsarAI's existing `{{ JavaScript }}` expressions; no parser is added
 * to the normal Sandbox execution path.
 */
export function convertExternalTemplateText(
  input: string,
  context: ExternalTemplateContext,
): ExternalTemplateConversion {
  const macro = convertSillyTavernSimpleMacros(input, context);
  const ejs = convertStPromptTemplateEjs(macro.text);
  return { text: ejs.text, issues: uniqueIssues([...macro.issues, ...ejs.issues]) };
}

export function convertSillyTavernSimpleMacros(
  input: string,
  context: ExternalTemplateContext,
): ExternalTemplateConversion {
  const issues: ExternalTemplateIssue[] = [];
  const tokens = scanMacroTokens(input);
  const scopedRanges = findScopedRanges(tokens);
  const skipped = new Set<number>();
  const replacements: Array<{ start: number; end: number; value: string }> = [];

  for (const range of scopedRanges) {
    range.tokenIndexes.forEach((index) => skipped.add(index));
    const name = macroName(tokens[range.openIndex]?.body ?? "scope");
    const reason = "作用域、闭合标签和 if/else 控制流不属于单纯宏转换范围。";
    issues.push({ syntax: "sillytavern-macro", name, reason });
    replacements.push({
      start: tokens[range.openIndex]!.start,
      end: tokens[range.closeIndex]!.end,
      value: unsupportedExpression("ST scoped macro", reason),
    });
  }

  tokens.forEach((token, index) => {
    if (skipped.has(index)) return;
    const converted = convertMacroToken(token, context);
    if ("issue" in converted) issues.push(converted.issue);
    replacements.push({ start: token.start, end: token.end, value: converted.value });
  });

  return { text: applyReplacements(input, replacements), issues: uniqueIssues(issues) };
}

export function convertStPromptTemplateEjs(input: string): ExternalTemplateConversion {
  if (!/<%[\s\S]*?%>/.test(input)) return { text: input, issues: [] };
  const issues: ExternalTemplateIssue[] = [];
  const blocked = findBlockedEjsRuntime(input);
  if (blocked.length) {
    blocked.forEach(([name, reason]) => issues.push({
      syntax: "st-prompt-template-ejs",
      name,
      reason,
    }));
    return {
      text: commentEjsRegion(input, unsupportedExpression(
        "ST-Prompt-Template EJS",
        `已注释不可用 EJS：${blocked.map(([name]) => name).join(", ")}`,
      )),
      issues: uniqueIssues(issues),
    };
  }

  try {
    return { text: compileEjsToSandboxExpression(input), issues };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    issues.push({ syntax: "st-prompt-template-ejs", name: "template", reason });
    return {
      text: commentEjsRegion(input, unsupportedExpression("ST-Prompt-Template EJS", reason)),
      issues,
    };
  }
}

function convertMacroToken(token: MacroToken, context: ExternalTemplateContext) {
  const body = token.body.trim();
  const name = macroName(body);
  const unsupported = (reason: string) => ({
    value: unsupportedExpression(`ST macro ${name || "unknown"}`, reason),
    issue: { syntax: "sillytavern-macro" as const, name: name || "unknown", reason },
  });
  if (token.nested) return unsupported("嵌套宏不属于单纯宏转换范围。");
  if (!body) return unsupported("空宏没有可转换的函数名称。");
  if (/^[!?#~>/. $]/.test(body)) {
    if (body.startsWith("//")) return { value: `{{("" /* SillyTavern comment */)}}` };
    return unsupported("宏标志、闭合标签、注释块或变量简写不属于单纯宏转换范围。");
  }
  const parsed = parseMacro(body);
  if (!parsed) return unsupported("宏名称或参数语法无法可靠解析。");
  const expression = macroExpression(parsed.name, parsed.args, context);
  if (!expression) return unsupported(unsupportedMacroReason(parsed.name));
  return { value: `{{(${expression})}}` };
}

function macroExpression(nameInput: string, args: string[], context: ExternalTemplateContext) {
  const name = nameInput.toLocaleLowerCase();
  const character = context.character ?? {};
  const literal = (value: unknown) => JSON.stringify(value ?? "");
  const arg = (index: number, fallback = "") => literal(args[index] ?? fallback);
  const localKey = (key: string) => `("pulsar:sillytavern:local:" + packageId + ":" + conversationId + ":" + String(${key}))`;
  const globalKey = (key: string) => `("pulsar:sillytavern:global:" + String(${key}))`;
  const read = (key: string) => `JSON.parse(localStorage.getItem(${key}) ?? "\\\"\\\"")`;
  const write = (key: string, value: string) => `(localStorage.setItem(${key}, JSON.stringify(${value})), "")`;
  const messageContent = (message: string) => `(typeof ${message}?.content === "string" ? ${message}.content : "")`;
  const lastMessage = "chat[chat.length - 1]";
  const findLastRole = (role: string) => `chat.slice().reverse().find((message) => message.role === ${literal(role)})`;

  switch (name) {
    case "char":
    case "bot":
    case "group":
    case "groupnotmuted":
    case "charifnotgroup": return `(capabilities.conversation.listPackages().find((item) => item.id === packageId)?.nickname ?? capabilities.conversation.listPackages().find((item) => item.id === packageId)?.name ?? ${literal(context.characterFileName)})`;
    case "user": return literal(context.userName || "User");
    case "notchar": return literal(context.userName || "User");
    case "description": return `(capabilities.conversation.listPackages().find((item) => item.id === packageId)?.description ?? ${literal(character.description)})`;
    case "personality": return character.personality == null ? null : literal(character.personality);
    case "scenario": return character.scenario == null ? null : literal(character.scenario);
    case "persona": return character.persona == null ? null : literal(character.persona);
    case "charprompt":
    case "systemprompt": return character.systemPrompt == null ? null : literal(character.systemPrompt);
    case "charinstruction": return character.instruction == null ? null : literal(character.instruction);
    case "chardepthprompt": return character.depthPrompt == null ? null : literal(character.depthPrompt);
    case "charcreatornotes": return character.creatorNotes == null ? null : literal(character.creatorNotes);
    case "charversion": return character.version == null ? null : literal(character.version);
    case "mesexamples":
    case "mesexamplesraw": return character.messageExamples == null ? null : literal(character.messageExamples);
    case "charfirstmessage": {
      const greetings = Array.isArray(character.greetings) ? character.greetings : [];
      const requested = Number(args[0] ?? 0);
      return literal(greetings[Number.isFinite(requested) ? requested : 0] ?? greetings[0] ?? "");
    }
    case "lastmessage": return messageContent(lastMessage);
    case "lastuseridmessage":
    case "lastusermessage": return messageContent(findLastRole("user"));
    case "lastcharmessage":
    case "lastchatmessage": return messageContent(findLastRole("assistant"));
    case "lastmessageid": return `String(Math.max(0, chat.length - 1))`;
    case "allchatrange": return `("0-" + String(Math.max(0, chat.length - 1)))`;
    case "getvar": return read(localKey(arg(0)));
    case "setvar": return write(localKey(arg(0)), arg(1));
    case "hasvar": return `String(localStorage.getItem(${localKey(arg(0))}) !== null)`;
    case "deletevar": return `(localStorage.removeItem(${localKey(arg(0))}), "")`;
    case "incvar": return incrementExpression(localKey(arg(0)), 1);
    case "decvar": return incrementExpression(localKey(arg(0)), -1);
    case "addvar": return addExpression(localKey(arg(0)), arg(1));
    case "getglobalvar": return read(globalKey(arg(0)));
    case "setglobalvar": return write(globalKey(arg(0)), arg(1));
    case "hasglobalvar": return `String(localStorage.getItem(${globalKey(arg(0))}) !== null)`;
    case "deleteglobalvar": return `(localStorage.removeItem(${globalKey(arg(0))}), "")`;
    case "incglobalvar": return incrementExpression(globalKey(arg(0)), 1);
    case "decglobalvar": return incrementExpression(globalKey(arg(0)), -1);
    case "addglobalvar": return addExpression(globalKey(arg(0)), arg(1));
    case "random": return args.length ? `${JSON.stringify(args)}[Math.floor(Math.random() * ${args.length})]` : `""`;
    case "roll": return diceExpression(args[0] ?? "1d20");
    case "newline": return `"\\n".repeat(Math.max(0, Number(${arg(0, "1")}) || 1))`;
    case "space": return `" ".repeat(Math.max(0, Number(${arg(0, "1")}) || 1))`;
    case "noop": return `""`;
    case "reverse": return `Array.from(String(${arg(0)})).reverse().join("")`;
    case "trim": return `String(${arg(0)}).replace(/^\\n+|\\n+$/g, "")`;
    case "input": return `String(prompt ?? "")`;
    case "model": return `""`;
    case "ismobile": return `String(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent))`;
    case "time": return `new Date(now()).toLocaleTimeString()`;
    case "date": return `new Date(now()).toLocaleDateString()`;
    case "weekday": return `new Date(now()).toLocaleDateString(undefined, { weekday: "long" })`;
    case "isotime": return `new Date(now()).toISOString().slice(11, 16)`;
    case "isodate": return `new Date(now()).toISOString().slice(0, 10)`;
    default: return null;
  }
}

function incrementExpression(key: string, amount: number) {
  const current = `JSON.parse(localStorage.getItem(${key}) ?? "0")`;
  const next = `(Number(${current}) + ${amount})`;
  return `(localStorage.setItem(${key}, JSON.stringify(${next})), JSON.parse(localStorage.getItem(${key}) ?? "0"))`;
}

function addExpression(key: string, value: string) {
  const current = `JSON.parse(localStorage.getItem(${key}) ?? "\\\"\\\"")`;
  const next = `(Number.isFinite(Number(${current})) && Number.isFinite(Number(${value})) ? String(Number(${current}) + Number(${value})) : ${current} + String(${value}))`;
  return `(localStorage.setItem(${key}, JSON.stringify(${next})), "")`;
}

function diceExpression(input: string) {
  const match = /^\s*(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?\s*$/i.exec(input);
  if (!match) return null;
  const count = Math.min(100, Math.max(1, Number(match[1] || 1)));
  const sides = Math.max(1, Number(match[2]));
  const modifier = Number(match[4] || 0) * (match[3] === "-" ? -1 : 1);
  return `(Array.from({ length: ${count} }, () => 1 + Math.floor(Math.random() * ${sides})).reduce((sum, value) => sum + value, 0) + ${modifier})`;
}

function unsupportedMacroReason(name: string) {
  const runtimeReasons: Record<string, string> = {
    summary: "没有可证明等价的 Summarize 扩展状态。",
    original: "原始覆盖消息只存在于 SillyTavern PromptManager 阶段。",
    outlet: "世界书 outlet 应显式迁移为 Plugin 容器，不能按宏键查询。",
    banned: "PulsarAI Chat Completion 流程没有文本补全 banned-word 通道。",
    hasextension: "不会复制 SillyTavern 扩展注册表。",
    pick: "稳定 pick 依赖酒馆聊天位置和 reroll 状态。",
    datetimeformat: "自定义日期格式依赖酒馆使用的格式化库。",
    timediff: "酒馆的人类可读时间差格式没有稳定等价契约。",
    idleduration: "当前环境没有可靠的最后用户活动时间。",
    maxprompt: "当前模板求值阶段没有最终 token 预算。",
    maxcontexttokens: "当前模板求值阶段没有最终上下文 token 预算。",
    maxresponsetokens: "当前模板求值阶段没有最终回复 token 预算。",
  };
  return runtimeReasons[name.toLocaleLowerCase()] ?? "没有已验证的 PulsarAI 数据来源或等价运行时契约。";
}

function compileEjsToSandboxExpression(input: string) {
  const pattern = /<%([#=_-]?)([\s\S]*?)([-_])?%>/g;
  const body: string[] = [];
  let cursor = 0;
  for (const match of input.matchAll(pattern)) {
    if (match.index == null) continue;
    const literal = input.slice(cursor, match.index);
    if (literal) body.push(`__out.push(${jsStringLiteral(literal)});`);
    const marker = match[1] ?? "";
    const source = (match[2] ?? "").trim();
    if (marker === "#") {
      body.push("/* EJS comment removed during migration. */");
    } else if (marker === "=" || marker === "-") {
      body.push(`__out.push(__string(${source || '""'}));`);
    } else {
      body.push(source);
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < input.length) body.push(`__out.push(${jsStringLiteral(input.slice(cursor))});`);
  if (!body.length) throw new Error("EJS 标签无法解析。 ");
  const source = [
    "{{((() => {",
    "const __out = [];",
    "const __string = (value) => value == null ? \"\" : String(value);",
    "const print = (...values) => { __out.push(...values.map(__string)); };",
    "const __localKey = (name) => \"pulsar:sillytavern:local:\" + packageId + \":\" + conversationId + \":\" + String(name);",
    "const __globalKey = (name) => \"pulsar:sillytavern:global:\" + String(name);",
    "const getvar = (name) => JSON.parse(localStorage.getItem(__localKey(name)) ?? '\"\"');",
    "const setvar = (name, value) => { localStorage.setItem(__localKey(name), JSON.stringify(value)); return \"\"; };",
    "const getglobalvar = (name) => JSON.parse(localStorage.getItem(__globalKey(name)) ?? '\"\"');",
    "const setglobalvar = (name, value) => { localStorage.setItem(__globalKey(name), JSON.stringify(value)); return \"\"; };",
    "const variables = new Proxy(Object.create(null), {",
    "get: (_target, name) => getvar(name),",
    "set: (_target, name, value) => { setvar(name, value); return true; },",
    "has: (_target, name) => localStorage.getItem(__localKey(name)) !== null,",
    "deleteProperty: (_target, name) => { localStorage.removeItem(__localKey(name)); return true; },",
    "});",
    ...body,
    "return __out.join(\"\");",
    "})()) }}",
  ].join("\n");
  if (source.slice(0, -2).includes("}}")) {
    throw new Error("EJS JavaScript 包含与 PulsarAI 动态表达式结束符冲突的连续右花括号。 ");
  }
  return source;
}

function commentEjsRegion(input: string, comment: string) {
  const start = input.indexOf("<%");
  const end = input.lastIndexOf("%>");
  if (start < 0 || end < start) return input;
  return input.slice(0, start) + comment + input.slice(end + 2);
}

function jsStringLiteral(value: string) {
  return JSON.stringify(value).replace(/}/g, "\\u007d");
}

function findBlockedEjsRuntime(input: string) {
  const blocked: Array<[string, string]> = [];
  const executableSource = Array.from(input.matchAll(/<%([#=_-]?)([\s\S]*?)(?:[-_])?%>/g))
    .filter((match) => match[1] !== "#")
    .map((match) => match[2] ?? "")
    .join("\n");
  for (const [name, reason] of unsupportedEjsRuntime) {
    const pattern = name === "await"
      ? /\bawait\b/
      : new RegExp(`\\b${escapeRegExp(name)}\\b`);
    if (pattern.test(executableSource)) blocked.push([name, reason]);
  }
  return blocked;
}

function scanMacroTokens(input: string) {
  const tokens: MacroToken[] = [];
  for (let index = 0; index < input.length - 1;) {
    if (input[index] !== "{" || input[index + 1] !== "{") {
      index += 1;
      continue;
    }
    const start = index;
    let depth = 1;
    let nested = false;
    index += 2;
    while (index < input.length - 1 && depth > 0) {
      if (input[index] === "{" && input[index + 1] === "{") {
        depth += 1;
        nested = true;
        index += 2;
      } else if (input[index] === "}" && input[index + 1] === "}") {
        depth -= 1;
        index += 2;
      } else {
        index += 1;
      }
    }
    if (depth !== 0) break;
    const raw = input.slice(start, index);
    tokens.push({ start, end: index, raw, body: raw.slice(2, -2), nested });
  }
  return tokens;
}

function findScopedRanges(tokens: MacroToken[]) {
  const ranges: Array<{ openIndex: number; closeIndex: number; tokenIndexes: number[] }> = [];
  const consumed = new Set<number>();
  tokens.forEach((token, closeIndex) => {
    const close = /^\s*\/\s*([A-Za-z][\w-]*)\s*$/.exec(token.body);
    if (!close) return;
    const name = close[1]!.toLocaleLowerCase();
    for (let openIndex = closeIndex - 1; openIndex >= 0; openIndex -= 1) {
      if (consumed.has(openIndex)) continue;
      if (macroName(tokens[openIndex]!.body) !== name) continue;
      const tokenIndexes = Array.from({ length: closeIndex - openIndex + 1 }, (_, offset) => openIndex + offset);
      tokenIndexes.forEach((index) => consumed.add(index));
      ranges.push({ openIndex, closeIndex, tokenIndexes });
      break;
    }
  });
  return ranges;
}

function parseMacro(body: string) {
  const doubleColon = body.split(/\s*::\s*/);
  if (doubleColon.length > 1) {
    const [name, ...args] = doubleColon;
    return validMacroName(name) ? { name: name!.trim(), args } : null;
  }
  const legacy = /^([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/.exec(body);
  if (legacy) return { name: legacy[1]!, args: [legacy[2]!] };
  const spaced = /^([A-Za-z][\w-]*)(?:\s+([\s\S]*))?$/.exec(body.trim());
  return spaced ? { name: spaced[1]!, args: spaced[2] == null ? [] : [spaced[2]] } : null;
}

function macroName(body: string) {
  return (/^\s*[#?!~>]*\s*\/?\s*([A-Za-z][\w-]*)/.exec(body)?.[1] ?? "unknown").toLocaleLowerCase();
}

function validMacroName(value?: string) {
  return Boolean(value && /^[A-Za-z][\w-]*$/.test(value.trim()));
}

function unsupportedExpression(label: string, reason: string) {
  const comment = `${label}: ${reason}`.replace(/\*\//g, "* /").replace(/[\r\n]+/g, " ");
  return `{{("" /* ${comment} */)}}`;
}

function applyReplacements(input: string, replacements: Array<{ start: number; end: number; value: string }>) {
  return [...replacements]
    .sort((left, right) => right.start - left.start)
    .reduce((text, replacement) => text.slice(0, replacement.start) + replacement.value + text.slice(replacement.end), input);
}

function uniqueIssues(issues: ExternalTemplateIssue[]) {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.syntax}:${issue.name}:${issue.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
