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
        HTMLElement.prototype.createDiv = function () {
          return this.createEl("div");
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
              setIcon() {
                return this;
              }
              onClick() {
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
    } finally {
      await browser.close();
    }
  }
);
