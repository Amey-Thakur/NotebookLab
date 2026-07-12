/*
 * Name: ipc-casing.test.ts
 * Purpose: Static guard for the IPC argument-casing contract.
 * Description: Every Rust command declares rename_all = "snake_case"
 *   (enforced by src-tauri/tests/ipc_casing_tests.rs), so every
 *   tauriInvoke call site must pass snake_case keys. vitest mocks
 *   invoke(), which means a camelCase key would pass unit tests
 *   and fail only at runtime; this scan is the compile-time net.
 *   Both shorthand and explicit keys are checked.
 * Tech Stack: Vitest, Node fs
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Extract the inline object literal passed as the second tauriInvoke argument. */
function extractInvokeArgObjects(source: string): string[] {
  const objects: string[] = [];
  const invokePattern = /tauriInvoke(?:<[^>]*>)?\(\s*"[a-z_]+"\s*,\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = invokePattern.exec(source)) !== null) {
    /* Walk the braces to find the matching close */
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < source.length && depth > 0) {
      if (source[index] === "{") depth += 1;
      if (source[index] === "}") depth -= 1;
      index += 1;
    }
    objects.push(source.slice(start, index - 1));
  }
  return objects;
}

describe("tauriInvoke argument casing", () => {
  it("uses snake_case keys in every invoke call site", () => {
    const violations: string[] = [];

    for (const file of collectSourceFiles(SRC_ROOT)) {
      const source = readFileSync(file, "utf-8");

      for (const objectBody of extractInvokeArgObjects(source)) {
        /* Explicit keys: identifier in property position (after { or , or at
           the start), followed by a colon. The position guard avoids matching
           ternary branches like `cond ? someValue : other`. */
        for (const keyMatch of objectBody.matchAll(/(?:^|[{,])\s*([A-Za-z_$][\w$]*)\s*:/g)) {
          if (/[A-Z]/.test(keyMatch[1])) {
            violations.push(`${file}: key "${keyMatch[1]}"`);
          }
        }
        /* Shorthand keys: identifier alone between delimiters */
        for (const shorthand of objectBody.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*[,}]/g)) {
          if (/[A-Z]/.test(shorthand[1])) {
            violations.push(`${file}: shorthand "${shorthand[1]}"`);
          }
        }
      }
    }

    expect(violations, `camelCase IPC keys found:\n${violations.join("\n")}`).toEqual([]);
  });
});
