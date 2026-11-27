import assert from "node:assert/strict";
import test from "node:test";

export function testVaultImports(browserType, isDesktopApp) {
  const platform = isDesktopApp ? "desktop" : "mobile";
  test(
    `the packaged ${platform} renderer resolves vault imports with only D2.js`,
    { timeout: 60000 },
    async (t) => {
      const browser = await browserType.launch();
      t.after(() => browser.close());
      const page = await browser.newPage();
      await page.route("https://obsidian.test/", (route) =>
        route.fulfill({ contentType: "text/html", body: "<body></body>" })
      );
      await page.goto("https://obsidian.test/");
      await page.context().setOffline(true);
      await page.evaluate((isDesktopApp) => {
        class TFile {
          constructor(path) {
            this.path = path;
          }
        }
        const files = new Map([
          ["shared.d2", "root: Root diagram"],
          ["Nested notes/shared.d2", "...@../lib/detail\nlocal: Nested diagram"],
          ["lib/detail.d2", "card: {label: Transitive import}"],
          ["Extra file.d2", "extra: Quoted file"],
          ["loop.d2", "...@other"],
          ["other.d2", "...@loop"],
          ["unused.d2", "unused: Unrelated vault file"],
        ]);
        const reads = [];
        const lookups = [];
        const vault = {
          getAbstractFileByPath(path) {
            lookups.push(path);
            return files.has(path) ? new TFile(path) : null;
          },
          async cachedRead(file) {
            reads.push(file.path);
            return files.get(file.path);
          },
        };
        window.fixture = { files, reads, lookups, vault };
        window.module = { exports: {} };
        window.require = (name) => {
          // A desktop child_process import also fails here, even when a CLI path is set.
          if (name !== "obsidian") throw new Error("Unexpected external module " + name);
          return {
            TFile,
            Platform: { isDesktopApp },
            addIcon() {},
            PluginSettingTab: class {},
            MarkdownRenderChild: class {},
            Plugin: class {
              app = { vault };
              async loadData() {
                return { d2Path: "/old/d2", apiToken: "old", theme: 4, sketch: false };
              }
              addSettingTab() {}
              registerMarkdownCodeBlockProcessor() {}
              addCommand() {}
            },
          };
        };
      }, isDesktopApp);
      await page.addScriptTag({ path: "main.js" });
      const actual = await page.evaluate(async () => {
        const plugin = new window.module.exports.default();
        await plugin.onload();
        const { reads, lookups, files, vault } = window.fixture;
        const renderer = plugin.processor.renderer;
        const render = (
          source,
          path = "Note.md",
          signal = new AbortController().signal
        ) => renderer.render(source, plugin.settings, signal, path);
        const labels = (svg) =>
          Array.from(
            new DOMParser()
              .parseFromString(svg, "image/svg+xml")
              .querySelectorAll("text"),
            (el) => el.textContent
          );
        const failure = (promise) =>
          promise.then(
            () => "",
            (e) => e.message
          );
        try {
          const [nested, root] = await Promise.all([
            render('...@shared\n...@shared\n...@"../Extra file"', "Nested notes/N.md"),
            render("...@shared"),
          ]);
          const requested = [...reads].sort();
          files.set("Nested notes/shared.d2", "edited: Latest contents");
          const updated = labels(await render("...@shared", "Nested notes/N.md"));
          const missing = await failure(render("...@absent\n...@also-absent"));
          const cycle = await failure(render("...@loop"));
          lookups.length = 0;
          const outside = await failure(
            render("...@../../private\n...@/outside", "Notes/N.md")
          );
          const outsideLookups = [...lookups];
          const controller = new AbortController();
          let readsBeforeCancel = 0;
          const cachedRead = vault.cachedRead;
          vault.cachedRead = async (file) => {
            readsBeforeCancel++;
            controller.abort();
            return cachedRead(file);
          };
          const cancelled = await failure(
            render("...@shared\n...@loop", "Note.md", controller.signal)
          );
          return {
            nested: labels(nested),
            root: labels(root),
            updated,
            missing,
            cycle,
            outside,
            outsideLookups,
            cancelled,
            readsBeforeCancel,
            requested,
            settings: plugin.settings,
          };
        } finally {
          plugin.onunload();
        }
      });
      assert.deepEqual(actual.root, ["Root diagram"]);
      assert.deepEqual(actual.nested.sort(), [
        "Nested diagram",
        "Quoted file",
        "Transitive import",
      ]);
      assert.deepEqual(actual.requested, [
        "Extra file.d2",
        "Nested notes/shared.d2",
        "lib/detail.d2",
        "shared.d2",
      ]);
      assert.deepEqual(actual.updated, ["Latest contents"]);
      assert.match(actual.missing, /absent\.d2/);
      assert.match(actual.missing, /also-absent\.d2/);
      assert.match(actual.cycle, /cyclic import/);
      assert.match(actual.outside, /failed to import/);
      assert.deepEqual(actual.outsideLookups, []);
      assert.match(actual.cancelled, /cancelled/);
      assert.equal(actual.readsBeforeCancel, 1);
      assert.equal(actual.settings.theme, 4);
      assert.equal(actual.settings.sketch, false);
      assert.equal("d2Path" in actual.settings, false);
      assert.equal("apiToken" in actual.settings, false);
    }
  );
}
