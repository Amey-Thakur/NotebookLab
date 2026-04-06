/*
 * Title: milkdown-editor.tsx
 * Tech Stack: React 19, Milkdown, ProseMirror
 * Description: Core Milkdown editor wrapper with [[wiki-link]] support.
 * Important Details: The editor instance is created once per mount. The wiki-link
 *   plugin decorates [[text]] patterns with styled inline marks. The listener
 *   plugin reports markdown changes for auto-save.
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
  className?: string;
}


export function MilkdownEditor({
  defaultValue = "",
  onChange,
  className = "",
}: MilkdownEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<Editor | null>(null);

  useEffect(() => {
    if (!editorRef.current) return;

    const el = editorRef.current;

    /* Wiki-link decoration as a Milkdown prose plugin */
    const wikiLinkPlugin = $prose(() => createWikiLinkDecorationPlugin());

    const createEditor = async () => {
      const editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, el);
          ctx.set(defaultValueCtx, defaultValue);

          if (onChange) {
            ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
              onChange(markdown);
            });
          }
        })
        .use(commonmark)
        .use(gfm)
        .use(listener)
        .use(wikiLinkPlugin)
        .create();

      editorInstance.current = editor;
    };

    createEditor();

    return () => {
      editorInstance.current?.destroy();
      editorInstance.current = null;
    };
  }, []); /* Editor created once, not on every re-render */

  return (
    <div
      ref={editorRef}
      className={`milkdown-editor-root ${className}`}
    />
  );
}
