export type MessageContentSegment =
  | {
      type: "markdown";
      content: string;
    }
  | {
      type: "interactive-code";
      content: string;
      language: string;
    };

const fencedCodePattern = /```([^\r\n]*)\r?\n([\s\S]*?)```/g;

function isInteractiveCode(content: string) {
  const normalized = content.toLocaleLowerCase();
  return (
    normalized.includes("<html")
    || normalized.includes("<!doctype")
    || normalized.includes("<script")
  );
}

export function splitInteractiveCodeBlocks(
  markdown: string,
): MessageContentSegment[] {
  const segments: MessageContentSegment[] = [];
  let cursor = 0;

  for (const match of markdown.matchAll(fencedCodePattern)) {
    const index = match.index ?? 0;
    const source = match[0];
    const language = match[1]?.trim() ?? "";
    const content = match[2] ?? "";
    if (index > cursor) {
      segments.push({
        type: "markdown",
        content: markdown.slice(cursor, index),
      });
    }
    segments.push(
      isInteractiveCode(content)
        ? {
            type: "interactive-code",
            content,
            language,
          }
        : {
            type: "markdown",
            content: source,
          },
    );
    cursor = index + source.length;
  }

  if (cursor < markdown.length) {
    segments.push({
      type: "markdown",
      content: markdown.slice(cursor),
    });
  }
  return segments.length > 0
    ? segments
    : [{ type: "markdown", content: markdown }];
}

export function buildInteractiveCodeDocument(content: string) {
  if (/<(?:!doctype\s+html|html)(?:\s|>)/i.test(content)) {
    return content;
  }
  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    "<style>",
    "html,body{min-height:100%;margin:0}",
    "body{font-family:ui-sans-serif,system-ui,sans-serif}",
    "*,*::before,*::after{box-sizing:border-box}",
    "</style>",
    "</head>",
    "<body>",
    content,
    "</body>",
    "</html>",
  ].join("");
}
