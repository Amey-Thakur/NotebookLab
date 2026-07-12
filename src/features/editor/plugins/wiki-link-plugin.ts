/*
 * Name: wiki-link-plugin.ts
 * Purpose: Custom Milkdown plugin that detects [[wiki-link]] syntax in the
 *   editor and renders them as styled inline...
 * Description: Custom Milkdown plugin that detects [[wiki-link]] syntax in
 *   the editor and renders them as styled inline links. This is a
 *   lightweight text-decoration approach. When the user types [[,
 *   text until ]] is styled as a link and tagged with
 *   data-note-title. Click navigation is handled by MilkdownEditor
 *   via event delegation on the editor root, which resolves or
 *   creates the target note.
 * Tech Stack: TypeScript, ProseMirror, Milkdown
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";


const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;
const pluginKey = new PluginKey("wiki-link-decoration");


/**
 * Creates a ProseMirror plugin that decorates [[wiki-link]] text with styling.
 * Returns a Milkdown-compatible plugin factory.
 */
export function createWikiLinkDecorationPlugin() {
  return new Plugin({
    key: pluginKey,

    state: {
      init(_, state) {
        return buildDecorations(state.doc);
      },

      apply(tr, decorations) {
        if (tr.docChanged) {
          return buildDecorations(tr.doc);
        }
        return decorations;
      },
    },

    props: {
      decorations(state) {
        return pluginKey.getState(state);
      },
    },
  });
}


/**
 * Scan the document for [[...]] patterns and create inline decorations.
 */
function buildDecorations(doc: any): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;

    const text = node.text || "";
    let match: RegExpExecArray | null;

    WIKI_LINK_REGEX.lastIndex = 0;
    while ((match = WIKI_LINK_REGEX.exec(text)) !== null) {
      const start = pos + match.index;
      const end = start + match[0].length;

      decorations.push(
        Decoration.inline(start, end, {
          class: "wiki-link",
          "data-note-title": match[1],
        }),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}
