import { marked } from "marked";

marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(src: string): string {
  return marked.parse(src) as string;
}
