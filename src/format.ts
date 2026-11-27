import MarkdownIt from "markdown-it";
import { Notice } from "obsidian";
import type { Command, Editor, MarkdownFileInfo } from "obsidian";
import type { D2Renderer } from "./renderer";

const markdown = new MarkdownIt("commonmark");

function findD2Block(note: string, cursorLine: number) {
  const lines = note.split(/\r?\n/);
  if (/^\uFEFF?---[ \t]*$/.test(lines[0])) {
    const end = lines.findIndex((line, index) => index > 0 && /^---[ \t]*$/.test(line));
    if (end > 0) lines.fill("", 0, end + 1);
  }

  for (const token of markdown.parse(lines.join("\n"), {})) {
    if (token.type !== "fence" || !/^d2(?:\s|$)/.test(token.info.trim()) || !token.map)
      continue;
    const [openingLine, end] = token.map;
    const closingLine = end - 1;
    if (cursorLine < openingLine || cursorLine > closingLine) continue;

    // A closed fence has an opening line, newline-terminated body lines, and a closing line.
    const source = token.content;
    if (source && !source.endsWith("\n")) continue;
    if (end - openingLine !== source.split("\n").length + 1) continue;

    const opening = lines[openingLine];
    // A list marker on the opening line becomes indentation on subsequent lines.
    const prefix = opening
      .slice(0, opening.indexOf(token.markup))
      .replace(/(?:[-+*]|\d{1,9}[.)])(?=[ \t])/g, (marker) => " ".repeat(marker.length));
    return { openingLine, closingLine, prefix, source };
  }
}

async function formatBlock(
  editor: Editor,
  view: MarkdownFileInfo,
  renderer: D2Renderer,
  note: string,
  block: NonNullable<ReturnType<typeof findD2Block>>
) {
  if (!block.source) return;
  const file = view.file;
  try {
    const formatted = await renderer.format(block.source);
    if (view.file !== file || view.editor !== editor) return;
    if (editor.getValue() !== note) {
      new Notice("The note changed while formatting. Run Format D2 Block again.");
      return;
    }
    if (formatted === block.source) return;

    const lines = formatted ? formatted.replace(/\n$/, "").split("\n") : [];
    const replacement = lines
      .map((line) => (line ? block.prefix + line : block.prefix.trimEnd()) + "\n")
      .join("");
    const from = { line: block.openingLine + 1, ch: 0 };
    const to = { line: block.closingLine, ch: 0 };
    const updated =
      note.slice(0, editor.posToOffset(from)) +
      replacement +
      note.slice(editor.posToOffset(to));

    // Reindent Markdown containers without turning body text into a Markdown fence.
    const updatedBlock = findD2Block(updated, block.openingLine);
    if (
      updatedBlock?.source !== formatted ||
      updatedBlock.closingLine !== from.line + lines.length
    ) {
      new Notice("Could not format D2 block without changing its Markdown fence.");
      return;
    }
    editor.replaceRange(replacement, from, to);
  } catch (error) {
    if (view.file === file && view.editor === editor) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not format D2 block.\n${message}`);
    }
  }
}

export function formatD2BlockCommand(renderer: D2Renderer): Command {
  return {
    id: "format-d2-block",
    name: "Format D2 Block",
    editorCheckCallback(checking, editor, view) {
      const note = editor.getValue();
      const block = findD2Block(note, editor.getCursor().line);
      if (!block) return false;
      if (!checking) void formatBlock(editor, view, renderer, note, block);
      return true;
    },
  };
}
