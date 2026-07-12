/*
 * Name: milkdown-editor.tsx
 * Purpose: Core Milkdown editor wrapper with [[wiki-link]] support.
 * Description: The editor instance is created once per mount; callbacks are
 *   read through refs so the effect never re-runs on prop identity
 *   changes. Creation is async, so a cancelled flag guards against
 *   the StrictMode mount-unmount-mount cycle leaving an orphaned
 *   editor attached to the DOM. Wiki-link clicks are handled by
 *   delegation on the root element, reading the data-note-title
 *   attribute written by the decoration plugin.
 * Tech Stack: React 19, Milkdown, ProseMirror
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { useEffect, useRef } from "react";

import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
import { $prose } from "@milkdown/kit/utils";

import { createWikiLinkDecorationPlugin } from "../plugins/wiki-link-plugin";


interface MilkdownEditorProps {
  defaultValue?: string;
  onChange?: (markdown: string) => void;
  onWikiLinkClick?: (title: string) => void;
  className?: string;
}


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

    /* Wiki-link decoration as a Milkdown prose plugin */
    const wikiLinkPlugin = $prose(() => createWikiLinkDecorationPlugin());

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
        .use(wikiLinkPlugin)
        .create();

      /* StrictMode unmounts before this resolves; destroy the orphan
         instead of leaving two editors attached to the same element. */
      if (cancelled) {
        editor.destroy();
        return;
      }
      editorInstance.current = editor;
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

  return (
    <div
      ref={editorRef}
      className={`milkdown-editor-root ${className}`}
    />
  );
}
