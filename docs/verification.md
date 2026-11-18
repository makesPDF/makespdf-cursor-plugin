# Verification

How this plugin is checked before each release and against Cursor's
[submission checklist](https://cursor.com/docs/reference/plugins#submission-checklist).

## Automated check

The repository has no runtime dependencies. With Node 20 or later:

```sh
npm run validate   # manifest, MCP config, component frontmatter, paths, secrets
npm test           # the same checks, plus negative fixtures
```

`npm run validate` must print `Validation passed` and exit zero.

## Cursor submission checklist

Checked against the reference page on 2026-11-18.

| Checklist item | Status | Evidence |
| --- | --- | --- |
| Valid root `plugin.json` or `.cursor-plugin/plugin.json` | ✅ | `.cursor-plugin/plugin.json` parses; validated by `npm run validate`. |
| `name` is unique, lowercase, kebab-case | ✅ | `makespdf`. |
| `description` clearly explains the plugin's purpose | ✅ | Manifest description; expanded in `README.md`. |
| All included components have valid files and frontmatter | ✅ | Skill and command frontmatter checked by the validator. |
| Logo is committed and referenced by a relative path | ✅ | `assets/logo.svg`, referenced as `assets/logo.svg`. |
| `README.md` documents usage and configuration | ✅ | Install, sign-in, use, billing and API-key alternative. |
| Agent Plugins conform to the Agent Plugins schemas | N/A | This is a Cursor Plugin (`.cursor-plugin/plugin.json`), not an Agent Plugin. |
| Cursor Plugins using variables declare every `${VAR}` | N/A | The plugin declares no `variables`; auth is per-user OAuth. |
| All manifest paths are relative and valid (no `..`, no absolute) | ✅ | Path check in `npm run validate`. |
| Plugin has been tested locally | ⏳ Operator | Procedure below; record the result in the task outcome. |
| Multi-plugin repositories have `.cursor-plugin/marketplace.json` | N/A | Single-plugin repository. |

## Local install and OAuth smoke test

Cursor skips symlinks that resolve outside `~/.cursor/plugins/local`, so copy
the repository rather than linking it.

```sh
rm -rf ~/.cursor/plugins/local/makespdf
mkdir -p ~/.cursor/plugins/local
cp -R . ~/.cursor/plugins/local/makespdf
```

1. Restart Cursor or run **Developer: Reload Window**.
2. Open **Customize** and confirm the plugin shows the `makespdf` skill, the
   `render-markdown-to-pdf` command and the `makespdf` MCP server.
3. In Agent chat, ask: *"Render this markdown file to an accessible PDF and
   save it next to the source."*
4. The first tool call shows Cursor's **Authenticate** prompt. The consent page
   should name cursor.com and Cursor's localhost return address. Approve it.
5. The agent calls `validate_markdown`, then `render_markdown` after confirming
   the credit cost, downloads the PDF from `downloadUrl`, and reports the saved
   path.
6. Check the PDF opens, is tagged, and has the expected page count and
   watermark state for the account's plan.

Record the result — Cursor version, account plan, whether sign-in and the
download succeeded — in the task outcome. The automated checks do not cover the
OAuth handshake or a real render; only a local run does.

## Secrets

No credential is committed. `mcp.json` uses Cursor's public OAuth client ID and
no headers. The README's API-key configuration contains only the
`mpdf_your_api_key` placeholder. The validator scans every small file in the
repository for credential-shaped strings, and the test suite proves the
scanner fires on one.
