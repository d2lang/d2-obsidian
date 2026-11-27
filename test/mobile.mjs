import assert from "node:assert/strict";
import test from "node:test";
import { webkit } from "playwright-core";

test(
  "the release bundle renders and formats offline in WebKit",
  { timeout: 60000 },
  async () => {
    const browser = await webkit.launch();
    try {
      const page = await browser.newPage();
      await page.route("https://obsidian.test/", (route) =>
        route.fulfill({ contentType: "text/html", body: "<body></body>" })
      );
      await page.goto("https://obsidian.test/");
      await page.context().setOffline(true);

      await page.evaluate(() => {
        HTMLElement.prototype.createEl = function (tag, options = {}) {
          const child = document.createElement(tag);
          child.textContent = options.text || "";
          this.appendChild(child);
          return child;
        };
        HTMLElement.prototype.createDiv = function (options) {
          return this.createEl("div", options);
        };
        HTMLElement.prototype.empty = function () {
          this.replaceChildren();
        };

        window.module = { exports: {} };
        window.notices = [];
        window.require = (name) => {
          if (name !== "obsidian") throw new Error(`Mobile cannot load ${name}`);
          return {
            Platform: { isDesktopApp: false },
            addIcon() {},
            Notice: class {
              constructor(message) {
                window.notices.push(message);
              }
            },
            Plugin: class {
              async loadData() {
                return null;
              }
              addSettingTab() {}
              registerMarkdownCodeBlockProcessor(_name, callback) {
                this.draw = callback;
              }
              addCommand(command) {
                this.command = command;
              }
            },
            PluginSettingTab: class {},
            MarkdownRenderChild: class {
              constructor(el) {
                this.containerEl = el;
              }
            },
            ButtonComponent: class {
              constructor(el) {
                this.buttonEl = el.createEl("button");
              }
              setClass() {
                return this;
              }
              setDisabled(disabled) {
                this.buttonEl.disabled = disabled;
                return this;
              }
              setIcon() {
                return this;
              }
              onClick(handler) {
                this.buttonEl.onclick = handler;
                return this;
              }
            },
          };
        };
      });
      await page.addScriptTag({ path: "main.js" });
      const labels = await page.evaluate(async () => {
        const plugin = new window.module.exports.default();
        await plugin.onload();
        try {
          const draw = async (layout) => {
            plugin.settings.layoutEngine = layout;
            const el = document.body.createDiv();
            await plugin.draw(`a: ${layout}\na -> b`, el, {
              docId: "note",
              addChild() {},
            });
            if (!el.querySelector("svg")) throw new Error(el.textContent);
            return Array.from(
              el.querySelectorAll("svg text"),
              (node) => node.textContent
            );
          };
          const results = [];
          for (const layout of ["dagre", "elk", "tala"]) results.push(await draw(layout));
          return results;
        } finally {
          plugin.onunload();
        }
      });
      for (const [i, layout] of ["dagre", "elk", "tala"].entries()) {
        assert.ok(labels[i].includes(layout), `Missing ${layout} diagram label`);
      }

      const appearance = await page.evaluate(async () => {
        const plugin = new window.module.exports.default();
        const oldSettings = { layoutEngine: "dagre", theme: 0, pad: 0, sketch: false };
        const example = { layoutEngine: "elk", theme: 4, pad: 7, sketch: true };
        const source = "a -> b\na -> c";
        const configured =
          "vars: {d2-config: {layout-engine: elk; theme-id: 4; pad: 7; sketch: true}}\n" +
          source;
        await plugin.onload();
        const draw = async (code, overrides = {}) => {
          const svg = await plugin.processor.renderer.render(
            code, { ...plugin.settings, ...overrides }, new AbortController().signal
          );
          const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
          return {
            bounds: doc.documentElement.getAttribute("viewBox"),
            stroke: /\.stroke-B1\s*\{\s*stroke:\s*([^;}]+)/.exec(svg)?.[1],
            sketch: Boolean(doc.querySelector('[class*="sketch-overlay"]')),
          };
        };
        try {
          const fromDiagram = await draw(configured);
          const explicit = await draw(source, example);
          plugin.loadData = async () => oldSettings;
          await plugin.loadSettings();
          return { fromDiagram, explicit, overridden: await draw(configured), plain: await draw(source) };
        } finally {
          plugin.onunload();
        }
      });
      assert.deepEqual(appearance.fromDiagram, appearance.explicit);
      assert.deepEqual(appearance.overridden, appearance.plain);
      assert.notEqual(appearance.fromDiagram.bounds, appearance.overridden.bounds);
      assert.notEqual(appearance.fromDiagram.stroke, appearance.overridden.stroke);
      assert.equal(appearance.fromDiagram.sketch, true);
      assert.equal(appearance.overridden.sketch, false);

      const results = await page.evaluate(async () => {
        const plugin = new window.module.exports.default();
        await plugin.onload();
        const renderer = plugin.processor.renderer;
        const format = renderer.format.bind(renderer);
        const command = plugin.command.editorCheckCallback;

        async function edit(note, cursorLine, duringFormat) {
          const notices = window.notices.length;
          let pending;
          renderer.format = (source) => {
            pending = format(source);
            return pending;
          };

          const editor = {
            getValue: () => note,
            getCursor: () => ({ line: cursorLine, ch: 0 }),
            posToOffset({ line, ch }) {
              return note.split("\n").slice(0, line).reduce((n, s) => n + s.length + 1, ch);
            },
            replaceRange(text, from, to) {
              note = note.slice(0, this.posToOffset(from)) + text + note.slice(this.posToOffset(to));
            },
          };
          const view = { editor, file: {} };
          const available = command(true, editor, view);
          command(false, editor, view);
          if (duringFormat) note = duringFormat(note);
          await pending?.catch(() => {});
          return { available, note, notices: window.notices.slice(notices) };
        }

        try {
          const first = [
            "Before",
            "> - ~~~~ d2 title=Pipeline",
            ">   a: {b------------>c}",
            ">   ~~~~~",
            "",
            "```d2",
            "d------------>e",
            "```",
            "After",
          ].join("\n");
          const boards = "```d2\nlayers:    @shared\napi\n```";
          const broken = "```d2\na: {\n```";
          const conflict = "```d2\na: |md\n    ```\n    foo\n    ```\n|\n```";
          return {
            first: await edit(first, 2),
            boards: await edit(boards, 1),
            invalid: await edit(broken, 1),
            conflict: await edit(conflict, 1),
            stale: await edit(first, 2, (source) => source + "\nNew paragraph"),
            otherFence: await edit("````markdown\n```d2\na->b\n```\n````", 2),
            frontmatter: await edit("---\nfoo: |\n  ```d2\n  a->b\n  ```\n---", 3),
            unclosed: await edit("```d2\na->b", 1),
          };
        } finally {
          plugin.onunload();
        }
      });

      assert.deepEqual(results.first, {
        available: true,
        note: "Before\n> - ~~~~ d2 title=Pipeline\n>   a: {b -> c}\n>   ~~~~~\n\n```d2\nd------------>e\n```\nAfter",
        notices: [],
      });
      assert.equal(results.invalid.note, "```d2\na: {\n```");
      assert.match(results.invalid.notices[0], /Could not format D2 block/);
      assert.equal(results.conflict.note, "```d2\na: |md\n    ```\n    foo\n    ```\n|\n```");
      assert.match(results.conflict.notices[0], /changing its Markdown fence/);
      assert.match(results.stale.note, /a: \{b------------>c\}[\s\S]+New paragraph$/);
      assert.match(results.stale.notices[0], /note changed while formatting/);
      for (const example of [results.otherFence, results.frontmatter, results.unclosed]) {
        assert.equal(example.available, false);
        assert.deepEqual(example.notices, []);
      }
      assert.equal(results.boards.note, "```d2\nlayers: @shared\napi\n```");

      const saved = await page.evaluate(async () => {
        const plugin = new window.module.exports.default();
        const files = new Map();
        const paths = [];
        const folder = "Projects/Attachments/";
        let fail = false;
        plugin.app = {
          fileManager: {
            async getAvailablePathForAttachment(name, sourcePath) {
              paths.push([name, sourcePath]);
              return folder + (files.has(folder + name) ? "Release - D2 1.svg" : name);
            },
          },
          vault: {
            getAbstractFileByPath: (path) => files.get(path),
            async create(path, data) {
              if (fail) throw new Error("Vault is read-only");
              if (files.has(path)) throw new Error("Already exists");
              files.set(path, data);
            },
          },
        };
        await plugin.onload();
        try {
          const ctx = { docId: "test", sourcePath: "Projects/Release.md", addChild() {} };
          const first = document.body.createDiv();
          const second = document.body.createDiv();
          await plugin.draw("reader -> writer", first, ctx);
          await plugin.draw("client -> server", second, ctx);
          const save = (el) => {
            const btn = Array.from(el.querySelectorAll("button")).find(
              (button) => button.textContent === "Save SVG"
            );
            return btn.onclick(new MouseEvent("click"));
          };
          await Promise.all([save(first), save(second)]);
          const firstSvg = files.get(folder + "Release - D2.svg");
          const secondSvg = files.get(folder + "Release - D2 1.svg");
          if (!firstSvg || !secondSvg) throw new Error("Missing attachment");
          const parsed = new DOMParser().parseFromString(firstSvg, "image/svg+xml");
          const root = parsed.documentElement;
          // Legacy Obsidian has no attachment-path API. Two saves must coexist beside the note.
          delete plugin.app.fileManager.getAvailablePathForAttachment;
          await save(first);
          await save(second);
          fail = true;
          await save(second);
          return {
            paths,
            files: [...files.keys()],
            firstLabels: Array.from(root.querySelectorAll("text"), (node) => node.textContent),
            secondHasServer: secondSvg.includes("server"),
            isSvg: root.localName === "svg" && root.namespaceURI === "http://www.w3.org/2000/svg",
            previewStyle: root.style.maxHeight,
            error: window.notices.at(-1),
          };
        } finally {
          plugin.onunload();
        }
      });
      assert.deepEqual(saved.paths, [
        ["Release - D2.svg", "Projects/Release.md"],
        ["Release - D2.svg", "Projects/Release.md"],
      ]);
      assert.deepEqual(saved.files, [
        "Projects/Attachments/Release - D2.svg", "Projects/Attachments/Release - D2 1.svg",
        "Projects/Release - D2.svg", "Projects/Release - D2 1.svg",
      ]);
      assert.ok(saved.isSvg && saved.secondHasServer && saved.firstLabels.includes("reader"));
      assert.equal(saved.previewStyle, "");
      assert.match(saved.error, /Vault is read-only/);
    } finally {
      await browser.close();
    }
  }
);
