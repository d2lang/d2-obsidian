import assert from "node:assert/strict";
import test from "node:test";
import { webkit } from "playwright-core";

test(
  "the release bundle renders three layouts offline in WebKit",
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
        window.require = (name) => {
          if (name !== "obsidian") throw new Error(`Mobile cannot load ${name}`);
          return {
            Platform: { isDesktopApp: false },
            addIcon() {},
            Plugin: class {
              async loadData() {
                return null;
              }
              addSettingTab() {}
              registerMarkdownCodeBlockProcessor(_name, callback) {
                this.draw = callback;
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
    } finally {
      await browser.close();
    }
  }
);
