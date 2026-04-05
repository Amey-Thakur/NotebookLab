# NotebookLab

Offline-first AI knowledge workspace with thinking partner capabilities.

## Tech Stack

- **Frontend:** React 19 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Rust (Tauri v2)
- **Database:** SQLite + sqlite-vec
- **LLM:** llama.cpp sidecar (GGUF models) + multi-provider abstraction
- **Embeddings:** ONNX Runtime + all-MiniLM-L6-v2

## Architecture

Modular, layered backend. Each module is self-contained and removable.

```
Commands (Tauri IPC) -> Services (business logic) -> Repositories (data access)
                                                  -> Providers (LLM abstraction)
                                                  -> Parsers (document formats)
```

## Coding Standards

- Every file starts with a header block (Title, Tech Stack, Description, Important Details)
- Comments explain "why" not "what"
- No AI filler text in code
- Complete naming, no abbreviations

## Commit Format

```
[1-3 word message]

Co-authored-by: Amey Thakur <ameythakur20@gmail.com>
Co-authored-by: Archit Konde <architkonde19@gmail.com>

* [1-5 word bullet]
* [1-5 word bullet]
```

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming -> invoke office-hours
- Bugs, errors, "why is this broken", 500 errors -> invoke investigate
- Ship, deploy, push, create PR -> invoke ship
- QA, test the site, find bugs -> invoke qa
- Code review, check my diff -> invoke review
- Update docs after shipping -> invoke document-release
- Weekly retro -> invoke retro
- Design system, brand -> invoke design-consultation
- Visual audit, design polish -> invoke design-review
- Architecture review -> invoke plan-eng-review
- Save progress, checkpoint, resume -> invoke checkpoint
- Code quality, health check -> invoke health
