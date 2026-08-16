/** Normalizes editor-generated HTML line breaks into plain Markdown newlines. */
export function normalizeMarkdownLineBreaks(markdown: string): string {
  return markdown.replace(/<br\s*\/?>/gi, "\n");
}
