# makesPDF for Cursor

Render archival, accessible PDFs from markdown or a template DSL without
leaving Cursor. This plugin connects the Cursor agent to the
[makesPDF](https://makespdf.com) MCP server, adds a `makespdf` skill that
knows the authoring workflow, and ships a command for the common
markdown-to-PDF case.

Every PDF is tagged and dual-compliant: PDF/A-2A for archival and PDF/UA-1 for
accessibility. Rendering is deterministic and takes about a second, with no
headless browser to launch.

## What's in the plugin

| Component     | Path                              | What it does                                                          |
| ------------- | --------------------------------- | --------------------------------------------------------------------- |
| MCP server    | `mcp.json`                        | Connects Cursor to `https://makespdf.com/api/v1/mcp` over OAuth.      |
| Skill         | `skills/makespdf/SKILL.md`        | Teaches the validate → preview → render workflow and how to save PDFs. |
| Command       | `commands/render-markdown-to-pdf.md` | Renders the current markdown file and saves the PDF to the workspace. |
| Plugin manifest | `.cursor-plugin/plugin.json`    | Marketplace metadata.                                                 |

## Install

### From the Cursor Marketplace

Once the plugin is listed: open **Customize** in Cursor, search for
**makesPDF**, choose **Install**, and pick a project or user scope.

### Locally

To try this repository before it is listed, copy it into Cursor's local plugin
directory:

```sh
mkdir -p ~/.cursor/plugins/local
cp -R /path/to/makespdf-cursor-plugin ~/.cursor/plugins/local/makespdf
```

Then restart Cursor or run **Developer: Reload Window** and confirm the
components appear under **Customize**. Cursor skips symlinks that resolve
outside `~/.cursor/plugins/local`, so copy the folder rather than linking it.

## Sign in

The MCP server authenticates each user with their own makesPDF account through
OAuth. On the first tool call Cursor shows an **Authenticate** prompt; approve
it in the browser. The consent page names cursor.com and the localhost return
address Cursor uses. There is no API key to paste and no plugin variable for a
team admin to set.

If you don't have an account yet, signing in creates one; makesPDF includes
free credits to try the render path.

## Use

Ask the agent for what you want, for example:

> Render this markdown file to an accessible PDF and save it next to the source.

or run the bundled command from chat:

```
/render-markdown-to-pdf
```

The agent picks the right makesPDF tools on its own, but the shape of the
workflow is always the same:

- **Markdown** — `validate_markdown` (free), then `render_markdown`.
- **A new or edited DSL template** — `validate_dsl` (free), then
  `render_dsl_preview` (free, watermarked), then `save_template`, then
  `render_template`.
- **An existing template** — `list_templates` / `get_template`, then
  `render_template`.

Billed renders return a short-lived `downloadUrl`; the agent downloads the PDF
from it into your workspace. Links last 15 minutes, and
`get_render_download_url` re-issues one from the render's `artifactId` for
free.

### Available tools

`validate_dsl`, `validate_markdown`, `render_dsl_preview`, `render_markdown`,
`render_template`, `save_template`, `list_templates`, `get_template`,
`update_template`, `delete_template`, `get_render_download_url`,
`report_feedback`.

## Billing

- `render_markdown` and `render_template` cost **1 credit per 10 pages** on
  success. A failed render deducts nothing, and both report `creditsDeducted`
  and `creditsRemaining` in their metadata.
- `validate_dsl`, `validate_markdown`, `render_dsl_preview`, template
  management and `get_render_download_url` are free.
- Previews are always stamped `PREVIEW — NOT FOR USE`. On the free plan,
  billed renders are watermarked; paid plans render clean.

## API-key alternative

OAuth is the recommended path for interactive use. If you need an API key
instead (CI, a shared machine, or a Cursor build without the `auth` field),
add a separate MCP entry with a Bearer header in `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "makespdf-api-key": {
      "url": "https://makespdf.com/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer mpdf_your_api_key"
      }
    }
  }
}
```

Create keys at <https://makespdf.com/settings/api-keys>. Keep the key out of
version control.

## Support

Email <support@makespdf.com>, or call the free `report_feedback` tool from a
Cursor session (it reports tool and workflow problems to the makesPDF team).

- MCP documentation: <https://makespdf.com/docs/mcp>
- Template authoring skill: <https://makespdf.com/skills/pdf-template-author.md>
- Repository: <https://github.com/makesPDF/makespdf-cursor-plugin>

## License

MIT — see [LICENSE](LICENSE).
