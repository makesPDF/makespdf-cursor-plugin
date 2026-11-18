---
name: render-markdown-to-pdf
description: Render the current markdown file to an accessible PDF through makesPDF and save the PDF next to the source.
---

# Render markdown to PDF

1. Identify the markdown file the user means — the file open in the editor,
   the one they named, or ask which. Read its full contents.
2. Call the makesPDF `validate_markdown` tool with the markdown. It is free.
   Fix any heading-hierarchy or alt-text problems it reports, then validate
   again.
3. Tell the user that `render_markdown` is billed at 1 credit per 10 pages and
   get their go-ahead before the first render.
4. Call `render_markdown`. Keep the returned `pageCount`, `creditsDeducted`,
   `creditsRemaining`, `artifactId` and `downloadUrl`.
5. Download the PDF with the returned URL into the same directory as the
   source file, using the source's basename:

   ```sh
   curl -sS -o <name>.pdf '<downloadUrl>'
   ```

   Do not reconstruct the PDF from the embedded base64 resource. If the link
   has expired, call `get_render_download_url` with the `artifactId` first.
6. Report the saved path, the page count and the credits deducted.
