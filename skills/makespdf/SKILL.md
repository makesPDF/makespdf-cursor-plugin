---
name: makespdf
description: Create archival, accessible PDFs from markdown or a template DSL through the makesPDF MCP server. Use when the user asks to render, export, or produce a PDF, invoice, receipt, statement, letter, CV, or other document.
---

# makesPDF

makesPDF turns markdown or a compact template DSL into a PDF that is tagged,
PDF/A-2A archival and PDF/UA-1 accessible at the same time. Rendering is
deterministic and takes about a second, with no headless browser.

This plugin connects Cursor to the hosted makesPDF MCP server at
`https://makespdf.com/api/v1/mcp` and signs in with the user's own makesPDF
account through OAuth. Cursor shows an **Authenticate** prompt on the first
tool call; no API key is needed.

This skill is a thin pointer: the authoring reference lives on makesPDF's site
and is fetched at use time, so it cannot go stale here.

## Before you render

Fetch the authoring reference for whichever input you are about to write:

- Template DSL — `https://makespdf.com/skills/pdf-template-author.md` (builder
  functions, style properties, nesting rules, recipes). **Fetch it when this
  skill runs**; never guess DSL syntax.
- Markdown — no authoring reference needed; use GitHub-flavoured markdown.
- Document recipes — `https://makespdf.com/skills/pdf-recipes.md` for a
  per-document skeleton (invoice, receipt, quote, statement, letter, CV).

Never guess a tool shape: validate first, preview second, render last.

## Pick the right path

| You have…                    | Do this                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Markdown                     | `validate_markdown` (free) → `render_markdown` (billed)                                                          |
| A new or edited DSL template | `validate_dsl` (free) → `render_dsl_preview` (free, watermarked) → `save_template` → `render_template` (billed) |
| An existing template         | `list_templates` / `get_template` to find it → `validate_dsl` (free) → `render_template` (billed)                |

Rules:

- `validate_dsl` and `validate_markdown` are free. Before every billed render,
  run the free validator that matches the input and fix what it reports: the
  markdown itself, or the DSL text — for an existing template, pass the DSL
  returned by `get_template` to `validate_dsl`. A template saved through
  `save_template` was validated then, but validate it again after any edit.
- `render_dsl_preview` is free but always stamped `PREVIEW — NOT FOR USE`. Use
  it to confirm layout before spending credits.
- Read a template with `get_template` before calling `render_template`, so you
  know which `data` keys it binds. Library templates can be rendered directly.
- `render_markdown` and `render_template` are **billed**: 1 credit per 10
  pages. Confirm the cost with the user before the first billed render.

## Save the PDF

A billed render returns `artifactId`, `downloadUrl` and
`downloadUrlExpiresAt` in its metadata. Download the PDF with that URL — it
needs no credentials, and it is the intended way to save the file:

```sh
curl -sS -o document.pdf '<downloadUrl>'
```

Write it somewhere in the user's workspace and report the path. Do not rebuild
the PDF from the embedded base64 resource. The URL expires after 15 minutes;
if it has, call `get_render_download_url` with the `artifactId` for a fresh one
(free).

## Cost and limits

- `render_markdown` and `render_template` cost 1 credit per 10 pages on
  success; a failed render deducts nothing. Both report `creditsDeducted` and
  `creditsRemaining`.
- Validation and `render_dsl_preview` are free.
- On the free plan the PDF is watermarked; paid plans render clean.
- Markdown is capped at 200KB of text; images at 5MB each and 20 per document.

## Getting unstuck

If a tool fails and the error does not explain it, or a capability is missing,
call `report_feedback` (free) with what you were trying to do. Do not include
the user's document text, DSL source or data values.

## Companion skills

- `https://makespdf.com/skills/pdf-template-author.md` — the template DSL.
- `https://makespdf.com/skills/pdf-api.md` — REST endpoints and error shapes.
- `https://makespdf.com/skills/pdf-recipes.md` — document recipes.
- `https://makespdf.com/skills/pdf-fonts.md` — custom fonts and fallbacks.

## Staying in sync

This file copies no reference material — every pointer above is fetched live
from makespdf.com. When a tool is added or retired, update the table here and
the README, and bump the plugin version.
