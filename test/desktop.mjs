import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("the desktop CLI resolves imports relative to each note", async (t) => {
  const vault = await mkdtemp(join(tmpdir(), "obsidian-d2-"));
  t.after(() => rm(vault, { recursive: true, force: true }));
  await mkdir(join(vault, "Nested notes"));
  await writeFile(join(vault, "shared.d2"), "a: Root diagram");
  await writeFile(join(vault, "Nested notes", "shared.d2"), "a: Nested diagram");

  class FileSystemAdapter {
    getFullPath(path) {
      return join(vault, path);
    }
  }
  const obsidian = {
    FileSystemAdapter,
    Platform: { isDesktopApp: true },
    MarkdownRenderChild: class {},
    PluginSettingTab: class {},
    Plugin: class {
      app = { vault: { adapter: new FileSystemAdapter() } };
      async loadData() {
        return null;
      }
      addSettingTab() {}
      registerMarkdownCodeBlockProcessor() {}
      addCommand() {}
    },
    addIcon() {},
  };
  const require = createRequire(import.meta.url);
  const bundle = await readFile(new URL("../main.js", import.meta.url), "utf8");
  const module = { exports: {} };
  new Function("module", "exports", "require", bundle)(module, module.exports, (name) =>
    name === "obsidian" ? obsidian : require(name)
  );
  const plugin = new module.exports.default();
  await plugin.onload();
  t.after(() => plugin.onunload());

  const render = (note) =>
    plugin.processor.renderer.render(
      "...@shared",
      plugin.settings,
      new AbortController().signal,
      note
    );
  const [root, nested] = await Promise.all([
    render("Root.md"),
    render("Nested notes/Entry.md"),
  ]);
  assert.match(root, />Root diagram</);
  assert.match(nested, />Nested diagram</);
});
