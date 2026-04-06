/*
 * Title: milkdown-editor.tsx
 * Tech Stack: React 19, Milkdown, ProseMirror
 * Description: Core Milkdown editor wrapper. Provides a WYSIWYG Markdown editing
 *   experience with real-time preview.
 * Important Details: Uses @milkdown/react for React integration. The editor instance
 *   is created once and re-used across content changes. The listener plugin reports
 *   markdown changes for auto-save. GFM preset adds tables, strikethrough, task lists.
 */

import { useEffect, useRef } from "react";

import { Editor, rootCtx, defaultValueCtx } from "@milkdown/core";
import { commonmark } from "@milkdown/preset-commonmark";
import { gfm } from "@milkdown/preset-gfm";
import { listener, listenerCtx } from "@milkdown/plugin-listener";
/* Nord theme CSS removed to avoid @layer conflict with Tailwind.
   Custom styles in src/styles/editor.css override defaults. */


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
