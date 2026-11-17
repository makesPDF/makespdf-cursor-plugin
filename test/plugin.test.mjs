import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import {
  isSafeRelativePath,
  parseFrontmatter,
  validatePlugin,
} from "../scripts/lib/validate-plugin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = [];

after(async () => {
  await Promise.all(
    fixtures.map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

async function makeFixture(mutate) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "makespdf-plugin-"));
  fixtures.push(parent);
  const root = path.join(parent, "plugin");
  await fs.cp(repoRoot, root, {
    recursive: true,
    filter: (source) =>
      !/(^|[\\/])(\.git|\.tmp|node_modules)([\\/]|$)/.test(source),
  });
  await mutate(root);
  return root;
}

async function editJson(file, mutate) {
  const data = JSON.parse(await fs.readFile(file, "utf8"));
  mutate(data);
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
}

async function assertFailsWith(mutate, expected) {
  const root = await makeFixture(mutate);
  const { errors } = await validatePlugin(root);
  assert.ok(
    errors.some((error) => expected.test(error)),
    `expected an error matching ${expected}, got:\n${errors.join("\n")}`,
  );
}

test("the repository is a valid Cursor plugin", async () => {
  const { errors, warnings, checks } = await validatePlugin(repoRoot);
  assert.deepEqual(errors, []);
  assert.ok(checks.length >= 10, `expected at least 10 checks, got ${checks.length}`);
  assert.ok(
    checks.some((check) => check.includes("https://makespdf.com/api/v1/mcp")),
    "the MCP endpoint check should have run",
  );
  assert.deepEqual(
    warnings,
    [],
    `the repository should not need warnings: ${warnings.join("; ")}`,
  );
});

test("rejects an absolute logo path", async () => {
  await assertFailsWith(async (root) => {
    await editJson(path.join(root, ".cursor-plugin", "plugin.json"), (manifest) => {
      manifest.logo = "/etc/passwd";
    });
  }, /unsafe path|relative path/);
});

test("rejects a remote URL logo", async () => {
  await assertFailsWith(async (root) => {
    await editJson(path.join(root, ".cursor-plugin", "plugin.json"), (manifest) => {
      manifest.logo = "https://example.com/logo.svg";
    });
  }, /must be committed to the repository and referenced by a relative path/);
});

test("rejects a plugin variable declaration", async () => {
  await assertFailsWith(async (root) => {
    await editJson(path.join(root, ".cursor-plugin", "plugin.json"), (manifest) => {
      manifest.variables = {
        type: "object",
        properties: { API_TOKEN: { type: "string" } },
        required: ["API_TOKEN"],
      };
    });
  }, /must not declare "variables"/);
});

test("rejects an mcp.json that falls back to headers", async () => {
  await assertFailsWith(async (root) => {
    await editJson(path.join(root, "mcp.json"), (mcp) => {
      mcp.mcpServers.makespdf.headers = {
        Authorization: "Bearer placeholder",
      };
    });
  }, /must not declare headers/);
});

test("rejects a wrong OAuth client ID", async () => {
  await assertFailsWith(async (root) => {
    await editJson(path.join(root, "mcp.json"), (mcp) => {
      mcp.mcpServers.makespdf.auth.CLIENT_ID = "https://example.com/client.json";
    });
  }, /CLIENT_ID/);
});

test("rejects a committed looks-like-real API key", async () => {
  await assertFailsWith(async (root) => {
    // Built at runtime so this test file never contains the value it scans for.
    const fakeKey = `mpdf_${"a".repeat(32)}`;
    await fs.writeFile(path.join(root, "notes.txt"), `${fakeKey}\n`);
  }, /makesPDF API key/);
});

test("scans extensionless files for secrets", async () => {
  await assertFailsWith(async (root) => {
    const fakeKey = `mpdf_${"b".repeat(32)}`;
    await fs.writeFile(
      path.join(root, ".env"),
      `MAKESPDF_API_KEY=${fakeKey}\n`,
    );
  }, /\.env looks like it contains a makesPDF API key/);
});

test("rejects a skill whose frontmatter name does not match its folder", async () => {
  await assertFailsWith(async (root) => {
    const file = path.join(root, "skills", "makespdf", "SKILL.md");
    const content = await fs.readFile(file, "utf8");
    await fs.writeFile(file, content.replace(/^name: makespdf$/m, "name: other"));
  }, /must be "makespdf"/);
});

test("rejects a second skill whose frontmatter name does not match its folder", async () => {
  await assertFailsWith(async (root) => {
    await fs.mkdir(path.join(root, "skills", "other"), { recursive: true });
    await fs.writeFile(
      path.join(root, "skills", "other", "SKILL.md"),
      [
        "---",
        "name: mismatched",
        "description: Another skill whose name does not match its folder.",
        "---",
        "",
        "Body",
        "",
      ].join("\n"),
    );
  }, /must be "other"/);
});

test("rejects a command without frontmatter", async () => {
  await assertFailsWith(async (root) => {
    await fs.writeFile(
      path.join(root, "commands", "broken.md"),
      "# No frontmatter here\n",
    );
  }, /has no YAML frontmatter/);
});

test("a command without frontmatter does not pass the aggregate check", async () => {
  const root = await makeFixture(async (root) => {
    await fs.writeFile(
      path.join(root, "commands", "broken.md"),
      "# No frontmatter here\n",
    );
  });
  const { errors, checks } = await validatePlugin(root);
  assert.ok(
    errors.some((error) => /has no YAML frontmatter/.test(error)),
    `expected a frontmatter error, got:\n${errors.join("\n")}`,
  );
  assert.ok(
    !checks.some((check) => check.includes("valid frontmatter")),
    `a failing command must not produce the pass line: ${checks.join("; ")}`,
  );
});

test("rejects a command named after its containing folder", async () => {
  await assertFailsWith(async (root) => {
    await fs.writeFile(
      path.join(root, "commands", "render.md"),
      [
        "---",
        "name: commands",
        "description: A command whose name matches its folder, not its file.",
        "---",
        "",
        "Body",
        "",
      ].join("\n"),
    );
  }, /frontmatter name "commands" does not match the file name/);
});

test("parseFrontmatter reads quoted and folded fields", () => {
  const fields = parseFrontmatter(
    [
      "---",
      'name: "makespdf"',
      "description: One line",
      "  continued here.",
      "---",
      "",
      "Body",
    ].join("\n"),
  );
  assert.equal(fields.name, "makespdf");
  assert.equal(fields.description, "One line continued here.");
});

test("parseFrontmatter accepts a closing delimiter at end of file", () => {
  const fields = parseFrontmatter(
    ["---", "name: makespdf", "description: No trailing newline", "---"].join("\n"),
  );
  assert.equal(fields.name, "makespdf");
  assert.equal(fields.description, "No trailing newline");
});

test("parseFrontmatter refuses a document without frontmatter", () => {
  assert.equal(parseFrontmatter("# Just a heading\n"), null);
});

test("isSafeRelativePath keeps paths inside the plugin", () => {
  assert.equal(isSafeRelativePath("assets/logo.svg"), true);
  assert.equal(isSafeRelativePath("./skills/makespdf/SKILL.md"), true);
  assert.equal(isSafeRelativePath("https://makespdf.com/logo.svg"), false);
  assert.equal(isSafeRelativePath("../outside.svg"), false);
  assert.equal(isSafeRelativePath("/etc/passwd"), false);
  assert.equal(isSafeRelativePath("C:\\Windows\\logo.svg"), false);
  assert.equal(isSafeRelativePath(""), false);
});
