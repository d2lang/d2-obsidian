import { MarkdownPostProcessorContext, ButtonComponent } from "obsidian";
import { exec, execSync } from "child_process";
import { delimiter } from "path";
import debounce from "lodash.debounce";
import os from "os";
import { CompileOptions, D2 } from "@terrastruct/d2";
import D2Plugin from "./main";

export class D2Processor {
  plugin: D2Plugin;
  debouncedMap: Map<
    string,
    (
      source: string,
      el: HTMLElement,
      ctx: MarkdownPostProcessorContext,
      signal?: AbortSignal
    ) => Promise<void>
  >;
  abortControllerMap: Map<string, AbortController>;
  prevImage: string;
  abortController: AbortController;

  constructor(plugin: D2Plugin) {
    this.plugin = plugin;
    this.debouncedMap = new Map();
    this.abortControllerMap = new Map();
  }

  attemptExport = async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) => {
    el.createEl("h6", {
      text: "Generating D2 diagram...",
      cls: "D2__Loading",
    });

    // we need to generate a debounce per split page, and ctx.containerEl is the only element we have access to that's page specific
    // however, it is not publically available in MarkdownPostProcessorContext, so we hack its access by casting it to an 'any' type
    const pageContainer = (ctx as any).containerEl;
    let pageID = pageContainer.dataset.pageID;
    if (!pageID) {
      pageID = Math.floor(Math.random() * Date.now()).toString();
      pageContainer.dataset.pageID = pageID;
    }

    let debouncedFunc = this.debouncedMap.get(pageID);
    if (!debouncedFunc) {
      // No need to debounce initial render
      await this.export(source, el, ctx);

      debouncedFunc = debounce(this.export, this.plugin.settings.debounce, {
        leading: true,
      });
      this.debouncedMap.set(pageID, debouncedFunc);
      return;
    }

    this.abortControllerMap.get(pageID)?.abort();
    const newAbortController = new AbortController();
    this.abortControllerMap.set(pageID, newAbortController);

    await debouncedFunc(source, el, ctx, newAbortController.signal);
  };

  isValidUrl = (urlString: string) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (e) {
      return false;
    }
    return url.protocol === "http:" || url.protocol === "https:";
  };

  formatLinks = (svgEl: HTMLElement) => {
    // Add attributes to <a> tags to make them Obsidian compatible :
    const links = svgEl.querySelectorAll("a");
    links.forEach((link: HTMLElement) => {
      const href = link.getAttribute("href") ?? "";
      // Check for internal link
      if (!this.isValidUrl(href)) {
        link.classList.add("internal-link");
        link.setAttribute("data-href", href);
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener");
      }
    });
  };

  sanitizeSVGIDs = (svgEl: HTMLElement, docID: string): string => {
    // append docId to <marker> || <mask> || <filter> id's so that they're unique across different panels & edit/view mode
    const overrides = svgEl.querySelectorAll("marker, mask, filter");
    const overrideIDs: string[] = [];
    overrides.forEach((override) => {
      const id = override.getAttribute("id");
      if (id) {
        overrideIDs.push(id);
      }
    });
    return overrideIDs.reduce((svgHTML, overrideID) => {
      return svgHTML.replaceAll(overrideID, [overrideID, docID].join("-"));
    }, svgEl.outerHTML);
  };

  insertImage(image: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
    const parser = new DOMParser();
    const svg = parser.parseFromString(image, "image/svg+xml");
    const containerEl = el.createDiv();

    const svgEl = svg.documentElement;
    svgEl.style.maxHeight = `${this.plugin.settings.containerHeight}px`;
    svgEl.style.maxWidth = "100%";
    svgEl.style.height = "fit-content";
    svgEl.style.width = "fit-content";

    this.formatLinks(svgEl);
    containerEl.innerHTML = this.sanitizeSVGIDs(svgEl, ctx.docId);
  }

  export = async (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext,
    signal?: AbortSignal
  ) => {
    try {
      const image = await this.generatePreview(source, signal);
      if (image) {
        el.empty();
        this.prevImage = image;
        this.insertImage(image, el, ctx);

        const button = new ButtonComponent(el)
          .setClass("Preview__Recompile")
          .setIcon("recompile")
          .onClick((e) => {
            e.preventDefault();
            e.stopPropagation();
            el.empty();
            this.attemptExport(source, el, ctx);
          });

        button.buttonEl.createEl("span", {
          text: "Recompile",
        });
      }
    } catch (err) {
      el.empty();
      const errorEl = el.createEl("pre", {
        cls: "markdown-rendered pre Preview__Error",
      });
      errorEl.createEl("code", {
        text: "D2 Compilation Error:",
        cls: "Preview__Error--Title",
      });
      errorEl.createEl("code", {
        text: err.message,
      });
      if (this.prevImage) {
        this.insertImage(this.prevImage, el, ctx);
      }
    } finally {
      const pageContainer = (ctx as any).containerEl;
      this.abortControllerMap.delete(pageContainer.dataset.id);
    }
  };

  async generatePreview(source: string, signal?: AbortSignal): Promise<string> {
    const d2 = new D2();

    let renderOptions: CompileOptions = {
      sketch: this.plugin.settings.sketch,
      themeID: this.plugin.settings.theme,
      // This doesn't seem to be used at all, so we could omit it.
      // Maybe there's some way to tell d2 if Obsidian is set to dark mode?
      // This could influence the default; or we could supply another setting
      // to allow users to quickly and seamlessly switch from light to dark mode.
      darkThemeID: this.plugin.settings.theme,
      // This does not actually seem to do anything at the moment,
      // from my limited testing.
      pad: this.plugin.settings.pad,
      // If the layout is set to TALA, this errors.
      // There does not seem to be TALA-support in the WASM-build yet.
      layout: this.plugin.settings.layoutEngine,
    };

    // The following proposal is a stupid, but actually working workaround for the problem with `vars.d2-config` shown below.
    // By compiling twice, we can extract the merged config from `result.diagram.config`
    //
    // let result = await d2.compile(source, renderOptions);
    // renderOptions = { ...renderOptions, ...result.diagram.config };
    // result = await d2.compile(source, renderOptions);

    const result = await d2.compile(source, renderOptions);

    // Just inputting `renderOptions` again means `vars.d2-config` does not work.
    // From my logging, the d2.compile does not output any `options` or `renderOptions`,
    // contrary to what the docs say
    const svg = await d2.render(result.diagram, renderOptions);

    // Obviously temporary and just used to inspect the actual behaviour
    // since the docs are understandably still a little light on details.
    console.group("Render Options");
    console.table(renderOptions);
    console.groupEnd();

    console.group("Compile Result");
    console.log(result);
    console.groupEnd();

    console.group("SVG");
    console.log(svg);
    console.groupEnd();

    return svg;
  }
}
