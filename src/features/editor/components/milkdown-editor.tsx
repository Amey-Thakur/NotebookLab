/*
 * Name: milkdown-editor.tsx
 * Purpose: Core Milkdown editor wrapper with [[wiki-link]] support and a
 *   formatting toolbar.
 * Description: The editor instance is created once per mount; callbacks are
 *   read through refs so the effect never re-runs on prop identity
 *   changes. Creation is async, so a cancelled flag guards against
 *   the StrictMode mount-unmount-mount cycle leaving an orphaned
 *   editor attached to the DOM. Wiki-link clicks are handled by
 *   delegation on the root element, reading the data-note-title
 *   attribute written by the decoration plugin. A toolbar exposes
 *   the everyday formatting commands, history gives undo and redo,
 *   and a placeholder plugin marks the empty document so the CSS
 *   hint can invite writing. Clicking the empty space below the
 *   last line focuses the editor, so the whole pane behaves like
 *   paper instead of a dead margin.
 * Tech Stack: React 19, Milkdown, ProseMirror
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useRef } from "react";

import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from "@milkdown/core";
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  wrapInBlockquoteCommand,
} from "@milkdown/preset-commonmark";
import { gfm, toggleStrikethroughCommand } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history, undoCommand, redoCommand } from "@milkdown/kit/plugin/history";
import { $prose, callCommand } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";

import { createWikiLinkDecorationPlugin } from "../plugins/wiki-link-plugin";


interface MilkdownEditorProps {
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  onWikiLinkClick?: (title: string) => void;
  className?: string;
}

/* Marks the first paragraph of an empty document so editor.css can show the
   "Start writing..." hint. Without this the hint rule never fires and an
   empty note looks like a dead page instead of an invitation. */
function createPlaceholderPlugin() {
  return new Plugin({
    key: new PluginKey("empty-doc-placeholder"),
    props: {
      decorations(state) {
        const { doc } = state;
        const empty =
          doc.childCount === 1 &&
          doc.firstChild?.type.name === "paragraph" &&
          doc.firstChild.content.size === 0;
        if (!empty) return DecorationSet.empty;
        return DecorationSet.create(doc, [
          Decoration.node(0, doc.firstChild.nodeSize, { class: "is-editor-empty" }),
        ]);
      },
    },
  });
}

/* The everyday formatting actions, in writing order. Each runs a Milkdown
   command through the live editor instance; payload carries heading level. */
const TOOLBAR: Array<
  | { label: string; title: string; cmd: () => Parameters<Editor["action"]>[0] }
  | "divider"
> = [
  { label: "↩", title: "Undo (Ctrl+Z)", cmd: () => callCommand(undoCommand.key) },
  { label: "↪", title: "Redo (Ctrl+Y)", cmd: () => callCommand(redoCommand.key) },
  "divider",
  { label: "H1", title: "Heading 1", cmd: () => callCommand(wrapInHeadingCommand.key, 1) },
  { label: "H2", title: "Heading 2", cmd: () => callCommand(wrapInHeadingCommand.key, 2) },
  "divider",
  { label: "B", title: "Bold (Ctrl+B)", cmd: () => callCommand(toggleStrongCommand.key) },
  { label: "I", title: "Italic (Ctrl+I)", cmd: () => callCommand(toggleEmphasisCommand.key) },
  { label: "S", title: "Strikethrough", cmd: () => callCommand(toggleStrikethroughCommand.key) },
  { label: "<>", title: "Inline code", cmd: () => callCommand(toggleInlineCodeCommand.key) },
  "divider",
  { label: "•", title: "Bullet list", cmd: () => callCommand(wrapInBulletListCommand.key) },
  { label: "1.", title: "Numbered list", cmd: () => callCommand(wrapInOrderedListCommand.key) },
  { label: "❝", title: "Quote", cmd: () => callCommand(wrapInBlockquoteCommand.key) },
];

export function MilkdownEditor({
  defaultValue = "",
  onChange,
  onWikiLinkClick,
  className = "",
}: MilkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<Editor | null>(null);

  /* Latest callbacks/content without re-creating the editor */
  const onChangeRef = useRef(onChange);
  const onWikiLinkClickRef = useRef(onWikiLinkClick);
  const defaultValueRef = useRef(defaultValue);
  useEffect(() => {
    onChangeRef.current = onChange;
    onWikiLinkClickRef.current = onWikiLinkClick;
  });

  useEffect(() => {
    if (!editorRef.current) return;

    const el = editorRef.current;
    let cancelled = false;

    /* Wiki-link decoration and the empty-document placeholder as prose plugins */
    const wikiLinkPlugin = $prose(() => createWikiLinkDecorationPlugin());
    const placeholderPlugin = $prose(() => createPlaceholderPlugin());

    const createEditor = async () => {
      const editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, el);
          ctx.set(defaultValueCtx, defaultValueRef.current);

          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
            onChangeRef.current?.(markdown);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(history)
        .use(wikiLinkPlugin)
        .use(placeholderPlugin)
        .create();

      /* StrictMode unmounts before this resolves; destroy the orphan
         instead of leaving two editors attached to the same element. */
      if (cancelled) {
        editor.destroy();
        return;
      }
      editorInstance.current = editor;

      /* A notepad greets you with a blinking cursor; so do we. */
      editor.action((ctx) => ctx.get(editorViewCtx).focus());
    };

    createEditor();

    /* Delegated wiki-link clicks: decorations are plain inline spans, so a
       single listener on the root covers every link without plugin state. */
    const handleClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement).closest?.(".wiki-link");
      const title = target?.getAttribute("data-note-title");
      if (title) {
        event.preventDefault();
        onWikiLinkClickRef.current?.(title.replace(/^\[\[|\]\]$/g, "").trim());
        return;
      }
      /* Clicking the blank space below the last line should start writing
         there, not land on a dead margin. */
      if (event.target === el || (event.target as HTMLElement).classList?.contains("milkdown")) {
        editorInstance.current?.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const tr = view.state.tr.setSelection(TextSelection.atEnd(view.state.doc));
          view.dispatch(tr);
          view.focus();
        });
      }
    };
    el.addEventListener("click", handleClick);

    return () => {
      cancelled = true;
      el.removeEventListener("click", handleClick);
      editorInstance.current?.destroy();
      editorInstance.current = null;
    };
  }, []); /* Editor created once; props flow through refs */

  const runCommand = (make: () => Parameters<Editor["action"]>[0]) => {
    editorInstance.current?.action(make());
    editorInstance.current?.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  return (
    <div className={className}>
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex items-center gap-0.5 flex-wrap mb-3 pb-2 border-b border-border sticky top-0 bg-surface z-10"
      >
        {TOOLBAR.map((item, index) =>
          item === "divider" ? (
            <span key={index} aria-hidden="true" className="w-px h-4 bg-border mx-1.5" />
          ) : (
            <button
              key={item.title}
              type="button"
              title={item.title}
              aria-label={item.title}
              /* mousedown would steal the selection the command needs */
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand(item.cmd)}
              className="min-w-7 h-7 px-1.5 text-xs font-mono text-text-3 border border-transparent
                         hover:text-text-1 hover:border-border hover:bg-surface-2 transition-colors"
            >
              {item.label}
            </button>
          ),
        )}
      </div>
      <div ref={editorRef} className="milkdown-editor-root" />
    </div>
  );
}
