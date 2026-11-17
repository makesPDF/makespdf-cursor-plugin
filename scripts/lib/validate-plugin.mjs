/**
 * Validates this repository as a Cursor plugin.
 *
 * Zero dependencies on purpose: the plugin itself ships only static files, so
 * the check that guards it should be runnable with a stock Node install.
 * `scripts/validate-plugin.mjs` is the CLI wrapper; `test/plugin.test.mjs`
 * exercises this module against the repository and against negative fixtures.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export const PLUGIN_NAME = "makespdf";
export const MCP_URL = "https://makespdf.com/api/v1/mcp";
export const CURSOR_CLIENT_ID = "https://cursor.com/oauth/mcp-client.json";
export const SUPPORT_EMAIL = "support@makespdf.com";
export const AUTHORING_SKILL_URL =
  "https://makespdf.com/skills/pdf-template-author.md";

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SEMVER_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^https?:\/\/\S+$/;

const SKIPPED_SEGMENTS = new Set([".git", ".tmp", "node_modules"]);

// Only shapes distinctive enough to be a real credential. The README's
// `mpdf_your_api_key` placeholder must not match.
const SECRET_PATTERNS = [
  { label: "makesPDF API key", pattern: /\bmpdf_[A-Za-z0-9]{16,}\b/ },
  { label: "OpenAI-style secret key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  {
    label: "private key block",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    label: "OAuth client secret value",
    pattern: /CLIENT_SECRET\s*[:=]\s*["']?[A-Za-z0-9_-]{8,}/,
  },
];

/** True for a relative path that stays inside the plugin directory. */
export function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (URL_PATTERN.test(value)) {
    return true;
  }
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  return normalized !== ".." && !normalized.startsWith("../");
}

/**
 * Minimal YAML frontmatter reader. Enough for the flat `key: value` fields
 * Cursor components use, including a description folded over several lines.
 */
export function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing === -1) {
    return null;
  }

  const fields = {};
  let currentKey = null;
  for (const line of normalized.slice(4, closing).split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match) {
      currentKey = match[1];
      fields[currentKey] = match[2].trim();
    } else if (currentKey && /^\s+/.test(line)) {
      fields[currentKey] = `${fields[currentKey]} ${line.trim()}`.trim();
    }
  }

  for (const [key, value] of Object.entries(fields)) {
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      fields[key] = value.slice(1, -1);
    }
  }
  return fields;
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function readJson(filePath, errors, label) {
  let raw;
  try {
    raw = await readText(filePath);
  } catch {
    errors.push(`${label} is missing: ${path.basename(filePath)}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error.message}`);
    return null;
  }
}

async function walkFiles(root) {
  const files = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (SKIPPED_SEGMENTS.has(entry.name)) {
        continue;
      }
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function collectPathValues(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectPathValues);
  }
  if (value && typeof value === "object") {
    const candidates = [];
    if (typeof value.path === "string") {
      candidates.push(value.path);
    }
    if (typeof value.file === "string") {
      candidates.push(value.file);
    }
    return candidates;
  }
  return [];
}

function checkToolingReference(content, token, label, errors) {
  if (!content.includes(token)) {
    errors.push(`${label} must mention \`${token}\``);
  }
}

export async function validatePlugin(root) {
  const errors = [];
  const warnings = [];
  const checks = [];

  const pass = (message) => {
    checks.push(message);
  };

  // --- Manifest -------------------------------------------------------------
  const manifestPath = path.join(root, ".cursor-plugin", "plugin.json");
  const manifest = await readJson(manifestPath, errors, "Plugin manifest");
  if (!manifest) {
    return { errors, warnings, checks };
  }

  if (typeof manifest.name !== "string" || !NAME_PATTERN.test(manifest.name)) {
    errors.push(
      'Plugin manifest "name" must be lowercase kebab-case, starting and ending with an alphanumeric.',
    );
  } else if (manifest.name !== PLUGIN_NAME) {
    errors.push(
      `Plugin manifest "name" is "${manifest.name}", expected "${PLUGIN_NAME}".`,
    );
  } else {
    pass("manifest name is lowercase kebab-case");
  }

  if (
    typeof manifest.description !== "string" ||
    manifest.description.trim().length < 10
  ) {
    errors.push('Plugin manifest needs a "description" of at least 10 characters.');
  } else {
    pass("manifest description is present");
  }

  if (manifest.version !== undefined) {
    if (
      typeof manifest.version !== "string" ||
      !SEMVER_PATTERN.test(manifest.version)
    ) {
      errors.push('Plugin manifest "version" must be a semantic version.');
    } else {
      pass(`manifest version ${manifest.version} is semver`);
    }
  } else {
    warnings.push('Plugin manifest has no "version"; add one before publishing.');
  }

  if (
    !manifest.author ||
    typeof manifest.author.name !== "string" ||
    manifest.author.name.length === 0
  ) {
    errors.push('Plugin manifest needs "author.name".');
  } else {
    if (
      manifest.author.email !== undefined &&
      !EMAIL_PATTERN.test(manifest.author.email)
    ) {
      errors.push('Plugin manifest "author.email" is not a valid address.');
    }
    if (manifest.author.email !== SUPPORT_EMAIL) {
      warnings.push(`Plugin manifest author email is not ${SUPPORT_EMAIL}.`);
    }
    pass("manifest author is present");
  }

  for (const field of ["homepage", "repository"]) {
    if (manifest[field] !== undefined && !URL_PATTERN.test(manifest[field])) {
      errors.push(`Plugin manifest "${field}" must be an http(s) URL.`);
    }
  }
  if (!manifest.homepage) {
    warnings.push('Plugin manifest has no "homepage".');
  }
  if (!manifest.repository) {
    warnings.push('Plugin manifest has no "repository".');
  }

  if (manifest.license !== undefined && typeof manifest.license !== "string") {
    errors.push('Plugin manifest "license" must be a string.');
  }

  if (manifest.keywords !== undefined) {
    if (
      !Array.isArray(manifest.keywords) ||
      manifest.keywords.some((keyword) => typeof keyword !== "string")
    ) {
      errors.push('Plugin manifest "keywords" must be an array of strings.');
    }
  }

  if (manifest.variables !== undefined) {
    errors.push(
      'Plugin manifest must not declare "variables": authentication is OAuth per user, not a team-set key.',
    );
  } else {
    pass("manifest declares no plugin variables");
  }

  for (const field of [
    "logo",
    "rules",
    "skills",
    "agents",
    "commands",
    "hooks",
    "mcpServers",
  ]) {
    for (const value of collectPathValues(manifest[field])) {
      if (!isSafeRelativePath(value)) {
        errors.push(
          `Plugin manifest "${field}" has an unsafe path "${value}"; use a relative path with no ".." or absolute prefix.`,
        );
        continue;
      }
      if (URL_PATTERN.test(value)) {
        continue;
      }
      if (!(await pathExists(path.join(root, value)))) {
        errors.push(`Plugin manifest "${field}" points at a missing path "${value}".`);
      }
    }
  }

  if (typeof manifest.logo === "string") {
    if (URL_PATTERN.test(manifest.logo) || !isSafeRelativePath(manifest.logo)) {
      errors.push(
        'Plugin manifest "logo" must be committed to the repository and referenced by a relative path.',
      );
    } else if (!(await pathExists(path.join(root, manifest.logo)))) {
      errors.push(`Plugin logo is missing: ${manifest.logo}`);
    } else {
      pass(`logo exists at ${manifest.logo}`);
    }
  } else {
    warnings.push('Plugin manifest has no "logo"; the marketplace entry will be plain.');
  }

  // --- MCP server -----------------------------------------------------------
  const mcpPath = path.join(root, "mcp.json");
  const mcp = await readJson(mcpPath, errors, "mcp.json");
  if (mcp) {
    const servers = mcp.mcpServers;
    if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
      errors.push('mcp.json must contain a "mcpServers" object.');
    } else {
      const names = Object.keys(servers);
      if (!names.includes(PLUGIN_NAME)) {
        errors.push(`mcp.json has no "${PLUGIN_NAME}" server entry.`);
      }
      if (names.length !== 1) {
        warnings.push(
          `mcp.json declares ${names.length} servers; this plugin is expected to declare only "${PLUGIN_NAME}".`,
        );
      }

      const server = servers[PLUGIN_NAME];
      if (!server || typeof server !== "object") {
        errors.push(`mcp.json "${PLUGIN_NAME}" entry must be an object.`);
      } else {
        if (server.url !== MCP_URL) {
          errors.push(
            `mcp.json "${PLUGIN_NAME}.url" must be ${MCP_URL}, got ${JSON.stringify(server.url)}.`,
          );
        } else {
          pass(`MCP server points at ${MCP_URL}`);
        }

        const clientId = server.auth && server.auth.CLIENT_ID;
        if (clientId !== CURSOR_CLIENT_ID) {
          errors.push(
            `mcp.json "${PLUGIN_NAME}.auth.CLIENT_ID" must be ${CURSOR_CLIENT_ID}.`,
          );
        } else {
          pass("MCP auth uses Cursor's client ID metadata document");
        }

        if (server.auth && server.auth.CLIENT_SECRET !== undefined) {
          errors.push(
            'mcp.json must not carry a CLIENT_SECRET; the plugin uses a public OAuth client.',
          );
        }

        if (server.headers !== undefined) {
          errors.push(
            'mcp.json must not declare headers; OAuth is the auth route and headers would mean a shared API key.',
          );
        } else {
          pass("MCP server declares no headers");
        }

        for (const field of ["command", "args", "env"]) {
          if (server[field] !== undefined) {
            errors.push(
              `mcp.json "${PLUGIN_NAME}" must be a remote server; "${field}" belongs to a stdio server.`,
            );
          }
        }
      }

      if (/\$\{[^}]+\}/.test(JSON.stringify(mcp))) {
        errors.push(
          "mcp.json contains a ${VAR} placeholder; this plugin declares no variables.",
        );
      }
    }
  }

  // --- Skills ---------------------------------------------------------------
  const skillFile = path.join(root, "skills", PLUGIN_NAME, "SKILL.md");
  if (!(await pathExists(skillFile))) {
    errors.push(`Skill is missing: skills/${PLUGIN_NAME}/SKILL.md`);
  } else {
    const frontmatter = parseFrontmatter(await readText(skillFile));
    if (!frontmatter) {
      errors.push(`skills/${PLUGIN_NAME}/SKILL.md has no YAML frontmatter.`);
    } else {
      if (frontmatter.name !== PLUGIN_NAME) {
        errors.push(
          `Skill frontmatter "name" must be "${PLUGIN_NAME}" and match its folder.`,
        );
      } else {
        pass("skill frontmatter name matches its folder");
      }
      if (!frontmatter.description || frontmatter.description.length < 20) {
        errors.push('Skill frontmatter needs a descriptive "description".');
      } else {
        pass("skill frontmatter description is present");
      }
    }

    const skill = await readText(skillFile);
    checkToolingReference(skill, AUTHORING_SKILL_URL, "Skill", errors);
    for (const token of [
      "validate_markdown",
      "validate_dsl",
      "render_markdown",
      "render_template",
      "downloadUrl",
      "get_render_download_url",
    ]) {
      checkToolingReference(skill, token, "Skill", errors);
    }
  }

  // --- Commands -------------------------------------------------------------
  const commandsDir = path.join(root, "commands");
  if (await pathExists(commandsDir)) {
    const commandFiles = (await walkFiles(commandsDir)).filter((file) =>
      [".md", ".mdc", ".markdown", ".txt"].includes(path.extname(file)),
    );
    if (commandFiles.length === 0) {
      warnings.push("commands/ exists but contains no command files.");
    }
    let commandErrors = 0;
    for (const file of commandFiles) {
      const relative = path.relative(root, file);
      const before = errors.length;
      const frontmatter = parseFrontmatter(await readText(file));
      if (!frontmatter) {
        errors.push(`${relative} has no YAML frontmatter.`);
        continue;
      }
      for (const key of ["name", "description"]) {
        if (!frontmatter[key]) {
          errors.push(`${relative} is missing "${key}" in its frontmatter.`);
        }
      }
      if (
        frontmatter.name &&
        frontmatter.name !== path.basename(path.dirname(file)) &&
        frontmatter.name !== path.basename(file, path.extname(file))
      ) {
        errors.push(
          `${relative} frontmatter name "${frontmatter.name}" does not match the file name.`,
        );
      }
      commandErrors += errors.length - before;
    }
    if (commandFiles.length > 0 && commandErrors === 0) {
      pass(`${commandFiles.length} command file(s) have valid frontmatter`);
    }
  }

  // --- README and licence ---------------------------------------------------
  const readmePath = path.join(root, "README.md");
  if (!(await pathExists(readmePath))) {
    errors.push("README.md is missing.");
  } else {
    const before = errors.length;
    const readme = await readText(readmePath);
    if (readme.trim().length < 300) {
      errors.push("README.md is too short to document install and usage.");
    }
    for (const token of [
      "OAuth",
      "API key",
      "1 credit per 10 pages",
      SUPPORT_EMAIL,
      "downloadUrl",
    ]) {
      checkToolingReference(readme, token, "README", errors);
    }
    if (errors.length === before) {
      pass("README documents OAuth, billing, support and the download path");
    }
  }

  if (!(await pathExists(path.join(root, "LICENSE")))) {
    errors.push("LICENSE is missing.");
  }

  // --- Secrets --------------------------------------------------------------
  // Read every small file that looks like text, not a fixed extension list: a
  // committed `.env` or extensionless credential file is exactly the accident
  // this check exists to catch. A NUL byte marks a binary file.
  const files = await walkFiles(root);
  let scanned = 0;
  for (const file of files) {
    const stat = await fs.stat(file).catch(() => null);
    if (!stat || stat.size > 1024 * 1024) {
      continue;
    }
    const buffer = await fs.readFile(file).catch(() => null);
    if (!buffer || buffer.includes(0)) {
      continue;
    }
    const content = buffer.toString("utf8");
    scanned += 1;
    for (const { label, pattern } of SECRET_PATTERNS) {
      if (pattern.test(content)) {
        errors.push(
          `${path.relative(root, file)} looks like it contains a ${label}. Remove it and rotate the credential.`,
        );
      }
    }
  }
  pass(`scanned ${scanned} files for committed secrets`);

  // --- Multi-plugin marker --------------------------------------------------
  if (await pathExists(path.join(root, ".cursor-plugin", "marketplace.json"))) {
    warnings.push(
      ".cursor-plugin/marketplace.json exists; this repository is a single plugin, so the marketplace manifest is unnecessary.",
    );
  }

  return { errors, warnings, checks };
}
