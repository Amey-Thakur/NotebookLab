/*
 * Title: wiki-link-plugin.ts
 * Tech Stack: TypeScript, ProseMirror, Milkdown
 * Description: Custom Milkdown plugin that detects [[wiki-link]] syntax in the editor
 *   and renders them as styled inline links.
 * Important Details: This is a lightweight text-decoration approach. When the user types
 *   [[, text until ]] is styled as a link. Clicking a wiki-link navigates to the
 *   referenced note (or creates it). Full ProseMirror node-based wiki-links would
 *   require a remark plugin for proper AST integration (Phase 2).
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
