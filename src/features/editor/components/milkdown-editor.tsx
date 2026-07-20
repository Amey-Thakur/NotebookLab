/*
 * Name: milkdown-editor.tsx
 * Purpose: Core Milkdown editor wrapper with [[wiki-link]] support and a
 *   full formatting toolbar that reliably drives the live editor.
 * Description: The editor instance is created once per mount; callbacks are
 *   read through refs so the effect never re-runs on prop identity
 *   changes. Creation is async, so a cancelled flag guards against
 *   the StrictMode mount-unmount-mount cycle leaving an orphaned
 *   editor attached to the DOM. Change and selection listeners are
 *   registered AFTER creation, on the ListenerManager the plugin
 *   actually injects; registering them in config() would attach them
 *   to a manager the plugin later replaces, so edits would never be
 *   reported and nothing would auto-save. The toolbar reflects the
 *   formats live at the cursor (a pressed button means "this is on
 *   here") and every button runs a real Milkdown command, so what the
 *   button promises is what the document does. Markdown shortcuts work
 *   while typing (`# `, `- `, `1. `, `> `, `- [ ] `, ```` ``` ````,
 *   **bold**, and so on), history gives undo and redo, the clipboard
 *   plugin keeps Markdown intact on copy and paste, and a placeholder
 *   plugin marks the empty document so the CSS hint can invite writing.
 *   Clicking the empty space below the last line focuses the editor,
 *   so the whole pane behaves like paper instead of a dead margin.
 * Tech Stack: React 19, Milkdown, ProseMirror
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-18
 */

import { useEffect, useRef, useState } from "react";

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
  createCodeBlockCommand,
  insertHrCommand,
  toggleLinkCommand,
} from "@milkdown/preset-commonmark";
import { gfm, toggleStrikethroughCommand, insertTableCommand } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { history, undoCommand, redoCommand } from "@milkdown/kit/plugin/history";
import { clipboard } from "@milkdown/kit/plugin/clipboard";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { $prose, callCommand } from "@milkdown/kit/utils";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Ctx } from "@milkdown/kit/ctx";

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

/* Which formats are switched on where the cursor sits. The toolbar reads this
   so a pressed button always means "this is active here", never a guess. */
function computeActiveFormats(state: EditorState): Set<string> {
  const active = new Set<string>();
  const { selection, storedMarks, schema, doc } = state;
  const { $from, from, to, empty } = selection;

  const markOn = (name: string, key: string) => {
    const type = schema.marks[name];
    if (!type) return;
    const on = empty ? !!type.isInSet(storedMarks || $from.marks()) : doc.rangeHasMark(from, to, type);
    if (on) active.add(key);
  };
  markOn("strong", "bold");
  markOn("emphasis", "italic");
  markOn("strike_through", "strike");
  markOn("inlineCode", "code");
  markOn("link", "link");

  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    switch (node.type.name) {
      case "heading":
        active.add(`h${node.attrs.level}`);
        break;
      case "blockquote":
        active.add("quote");
        break;
      case "code_block":
        active.add("codeblock");
        break;
      case "bullet_list":
        active.add("bullet");
        break;
      case "ordered_list":
        active.add("ordered");
        break;
      case "list_item":
        if (node.attrs.checked === true || node.attrs.checked === false) active.add("task");
        break;
    }
  }
  return active;
}

/* Turn the current line(s) into (or out of) a task list. GFM ships no command
   for this, so we do it directly: guarantee a bullet list, then flip each
   affected list item's checkbox between "none" and "unchecked". Runs as one
   editor action so a single click always lands a usable checkbox. */
function toggleTaskList(ctx: Ctx) {
  const view = ctx.get(editorViewCtx);
  const inList = (() => {
    const { $from } = view.state.selection;
    for (let d = $from.depth; d > 0; d--) {
      const name = $from.node(d).type.name;
      if (name === "bullet_list" || name === "ordered_list") return true;
    }
    return false;
  })();

  if (!inList) callCommand(wrapInBulletListCommand.key)(ctx);

  const { state } = view;
  const listItem = state.schema.nodes.list_item;
  if (!listItem) return;
  const { from, to } = state.selection;
  const tr = state.tr;
  let anyPlain = false;
  const items: Array<{ pos: number; attrs: Record<string, unknown> }> = [];
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type === listItem) {
      items.push({ pos, attrs: node.attrs });
      if (node.attrs.checked === null || node.attrs.checked === undefined) anyPlain = true;
    }
  });
  for (const item of items) {
    tr.setNodeMarkup(item.pos, undefined, { ...item.attrs, checked: anyPlain ? false : null });
  }
  if (tr.docChanged) view.dispatch(tr);
  view.focus();
}

type ToolbarButton = {
  kind: "cmd" | "action" | "link" | "task";
  key: string;
  label: string;
  title: string;
  run?: () => (ctx: Ctx) => unknown;
  activeKey?: string;
};

/* The everyday formatting actions, grouped in writing order. Each carries the
   real command it runs and the active-state key that lights its button. */
const TOOLBAR: Array<ToolbarButton | "divider"> = [
  { kind: "cmd", key: "undo", label: "↩", title: "Undo (Ctrl+Z)", run: () => callCommand(undoCommand.key) },
  { kind: "cmd", key: "redo", label: "↪", title: "Redo (Ctrl+Y)", run: () => callCommand(redoCommand.key) },
  "divider",
  { kind: "cmd", key: "h1", label: "H1", title: "Heading 1", run: () => callCommand(wrapInHeadingCommand.key, 1), activeKey: "h1" },
  { kind: "cmd", key: "h2", label: "H2", title: "Heading 2", run: () => callCommand(wrapInHeadingCommand.key, 2), activeKey: "h2" },
  { kind: "cmd", key: "h3", label: "H3", title: "Heading 3", run: () => callCommand(wrapInHeadingCommand.key, 3), activeKey: "h3" },
  "divider",
  { kind: "cmd", key: "bold", label: "B", title: "Bold (Ctrl+B)", run: () => callCommand(toggleStrongCommand.key), activeKey: "bold" },
  { kind: "cmd", key: "italic", label: "I", title: "Italic (Ctrl+I)", run: () => callCommand(toggleEmphasisCommand.key), activeKey: "italic" },
  { kind: "cmd", key: "strike", label: "S", title: "Strikethrough", run: () => callCommand(toggleStrikethroughCommand.key), activeKey: "strike" },
  { kind: "cmd", key: "code", label: "<>", title: "Inline code", run: () => callCommand(toggleInlineCodeCommand.key), activeKey: "code" },
  { kind: "link", key: "link", label: "🔗", title: "Link", activeKey: "link" },
  "divider",
  { kind: "cmd", key: "bullet", label: "•", title: "Bullet list", run: () => callCommand(wrapInBulletListCommand.key), activeKey: "bullet" },
  { kind: "cmd", key: "ordered", label: "1.", title: "Numbered list", run: () => callCommand(wrapInOrderedListCommand.key), activeKey: "ordered" },
  { kind: "task", key: "task", label: "☑", title: "Task list", activeKey: "task" },
  "divider",
  { kind: "cmd", key: "quote", label: "❝", title: "Quote", run: () => callCommand(wrapInBlockquoteCommand.key), activeKey: "quote" },
  { kind: "cmd", key: "codeblock", label: "{ }", title: "Code block", run: () => callCommand(createCodeBlockCommand.key), activeKey: "codeblock" },
  { kind: "cmd", key: "hr", label: "―", title: "Divider", run: () => callCommand(insertHrCommand.key) },
  { kind: "cmd", key: "table", label: "▦", title: "Table", run: () => callCommand(insertTableCommand.key) },
];

export function MilkdownEditor({
  defaultValue = "",
  onChange,
  onWikiLinkClick,
  className = "",
}: MilkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<Editor | null>(null);

  /* Which format buttons are lit for the current cursor position. */
  const [active, setActive] = useState<Set<string>>(new Set());

  /* Inline link entry: opens under the toolbar so a URL never needs a
     browser prompt the desktop webview might block. */
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

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
        })
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(history)
        .use(clipboard)
        .use(cursor)
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

      /* Register listeners on the ListenerManager the plugin actually uses.
         Doing this in config() would target a manager the plugin replaces,
         so edits would never be reported and the note would never save. */
      editor.action((ctx) => {
        const manager = ctx.get(listenerCtx);
        manager.markdownUpdated((_ctx, markdown) => {
          onChangeRef.current?.(markdown);
        });
        /* selectionUpdated fires while the new state is still being computed,
           so read the view a microtask later, once it holds the selection the
           user is actually on. This keeps the toolbar's lit buttons honest. */
        const refresh = () => {
          queueMicrotask(() => {
            const next = computeActiveFormats(ctx.get(editorViewCtx).state);
            setActive((prev) => (sameSet(prev, next) ? prev : next));
          });
        };
        manager.selectionUpdated(refresh);
        manager.updated(refresh);
        refresh();
      });

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

  const runCommand = (make: () => (ctx: Ctx) => unknown) => {
    editorInstance.current?.action(make());
    editorInstance.current?.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  const runAction = (action: (ctx: Ctx) => void) => {
    editorInstance.current?.action(action);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (url) {
      editorInstance.current?.action(callCommand(toggleLinkCommand.key, { href: url }));
    }
    setLinkOpen(false);
    setLinkUrl("");
    editorInstance.current?.action((ctx) => ctx.get(editorViewCtx).focus());
  };

  const buttonClass = (isActive: boolean) =>
    [
      "min-w-7 h-7 px-1.5 rounded-md text-xs font-mono border transition-colors",
      isActive
        ? "text-accent border-accent-dim bg-surface-2"
        : "text-text-3 border-transparent hover:text-text-1 hover:border-border hover:bg-surface-2",
    ].join(" ");

  return (
    <div className={className}>
      <div
        role="toolbar"
        aria-label="Formatting"
        className="flex items-center gap-0.5 flex-wrap mb-3 pb-2 border-b border-border sticky top-0 bg-surface z-10"
      >
        {TOOLBAR.map((item, index) => {
          if (item === "divider") {
            return <span key={`d${index}`} aria-hidden="true" className="w-px h-4 bg-border mx-1.5" />;
          }
          const isActive = item.activeKey ? active.has(item.activeKey) : false;
          const onClick = () => {
            if (item.kind === "link") {
              setLinkOpen((open) => !open);
              return;
            }
            if (item.kind === "task") {
              runAction(toggleTaskList);
              return;
            }
            if (item.run) runCommand(item.run);
          };
          return (
            <button
              key={item.key}
              type="button"
              title={item.title}
              aria-label={item.title}
              aria-pressed={item.activeKey ? isActive : undefined}
              /* mousedown would steal the selection the command needs */
              onMouseDown={(e) => e.preventDefault()}
              onClick={onClick}
              className={buttonClass(isActive)}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {linkOpen && (
        <div className="flex items-center gap-2 mb-3 -mt-1">
          <input
            type="url"
            value={linkUrl}
            autoFocus
            placeholder="https://example.com"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setLinkOpen(false);
                setLinkUrl("");
              }
            }}
            className="flex-1 max-w-md h-7 px-2 rounded-md text-xs font-mono bg-surface-2 border border-border
                       text-text-1 outline-none focus-visible:border-accent-dim"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={applyLink}
            className="h-7 px-2 rounded-md text-xs font-mono border border-border text-text-2
                       hover:text-text-1 hover:border-accent-dim transition-colors"
          >
            Add link
          </button>
        </div>
      )}

      <div ref={editorRef} className="milkdown-editor-root" />
    </div>
  );
}

/* Cheap equality for the active-format sets, so cursor movement only
   re-renders the toolbar when the set of lit buttons actually changes. */
function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}
