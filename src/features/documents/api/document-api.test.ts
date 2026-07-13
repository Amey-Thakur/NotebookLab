/*
 * Name: document-api.test.ts
 * Purpose: Tests for document API layer.
 * Description: Verifies invoke wrappers pass correct command names and
 *   arguments to Tauri IPC.
 * Tech Stack: Vitest
 * License: MIT
 * Authors: Amey Thakur (https://github.com/Amey-Thakur)
 *          Archit Konde (https://github.com/Archit-Konde)
 * Date: 2026-07-12
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

import { listDocuments, importDocument, deleteDocument, getDocumentChunks, pickDocumentFile } from "./document-api";


describe("document-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listDocuments calls correct command", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await listDocuments("nb-1");

    expect(invoke).toHaveBeenCalledWith("list_documents", { notebook_id: "nb-1" });
  });

  it("importDocument calls correct command", async () => {
    vi.mocked(invoke).mockResolvedValue("doc-id");
    await importDocument("nb-1", "/path/to/file.pdf");

    expect(invoke).toHaveBeenCalledWith("import_document", {
      notebook_id: "nb-1",
      file_path: "/path/to/file.pdf",
    });
  });

  it("deleteDocument calls correct command", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await deleteDocument("doc-1");

    expect(invoke).toHaveBeenCalledWith("delete_document", { id: "doc-1" });
  });

  it("getDocumentChunks calls correct command", async () => {
    vi.mocked(invoke).mockResolvedValue([]);
    await getDocumentChunks("doc-1");

    expect(invoke).toHaveBeenCalledWith("get_document_chunks", { document_id: "doc-1" });
  });
});


describe("pickDocumentFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when dialog is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const result = await pickDocumentFile();
    expect(result).toBeNull();
  });

  it("returns file path when file is selected", async () => {
    vi.mocked(open).mockResolvedValue("/path/to/doc.pdf");
    const result = await pickDocumentFile();
    expect(result).toBe("/path/to/doc.pdf");
  });

  it("calls open with grouped supported filters", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await pickDocumentFile();

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({
        multiple: false,
        filters: expect.arrayContaining([
          expect.objectContaining({
            name: "All supported",
            extensions: expect.arrayContaining(["txt", "md", "pdf", "docx", "png"]),
          }),
          expect.objectContaining({
            name: "Documents",
            extensions: expect.arrayContaining(["txt", "md", "pdf", "docx"]),
          }),
          expect.objectContaining({
            name: "Images",
            extensions: expect.arrayContaining(["png", "jpg", "jpeg"]),
          }),
        ]),
      }),
    );

    /* Documents and Images stay disjoint: no image in Documents, no doc in Images. */
    const call = vi.mocked(open).mock.calls[0][0] as {
      filters: { name: string; extensions: string[] }[];
    };
    const documents = call.filters.find((f) => f.name === "Documents");
    const images = call.filters.find((f) => f.name === "Images");
    expect(documents?.extensions).not.toContain("png");
    expect(images?.extensions).not.toContain("docx");
  });
});
