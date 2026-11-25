import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  ButtonComponent,
} from "obsidian";
import debounce from "lodash.debounce";

import type D2Plugin from "./main";
import { D2Renderer } from "./renderer";

export class D2Processor {
  private readonly blocks = new Map<HTMLElement, DiagramBlock>();
  readonly renderer = new D2Renderer();
  private nextId = 0;

  constructor(readonly plugin: D2Plugin) {}

  attemptExport = (
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ) => {
    let block = this.blocks.get(el);
    if (!block) {
      block = new DiagramBlock(el, this, `${ctx.docId}-${this.nextId++}`);
      this.blocks.set(el, block);
      ctx.addChild(block);
    }
    return block.update(source);
  };

  remove(el: HTMLElement) {
    this.blocks.delete(el);
  }

  dispose() {
    for (const block of this.blocks.values()) block.cancel();
    this.blocks.clear();
    this.renderer.dispose();
  }
}

class DiagramBlock extends MarkdownRenderChild {
  private controller?: AbortController;
  private previousImage?: string;
  private readonly schedule = debounce(
    (source: string, signal: AbortSignal) => this.render(source, signal),
    this.owner.plugin.settings.debounce,
    { leading: true }
  );

  constructor(el: HTMLElement, private owner: D2Processor, private docId: string) {
    super(el);
  }

  update(source: string) {
    this.controller?.abort();
    this.controller = new AbortController();
    this.containerEl.empty();
    this.containerEl.createEl("h6", {
      text: "Generating D2 diagram...",
      cls: "D2__Loading",
    });
    return this.schedule(source, this.controller.signal);
  }

  cancel() {
    this.schedule.cancel();
    this.controller?.abort();
  }

  onunload() {
    this.cancel();
    this.owner.remove(this.containerEl);
  }

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

      // Leave http/https links as is
      if (this.isValidUrl(href)) return;

      // Add attributes to make the link Obsidian compatible
      link.classList.add("internal-link");
      link.setAttribute("data-href", href);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noopener");

      // Check for Obsidian "[[]]" internal links
      const internalLink = href.match(/^\[\[([^\]]+)]]$/);
      if (internalLink) {
        const [_, linkText] = internalLink;
        link.setAttribute("data-href", linkText);
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

  insertImage(image: string, el: HTMLElement, docId: string) {
    const parser = new DOMParser();
    const svg = parser.parseFromString(image, "image/svg+xml");
    const containerEl = el.createDiv();

    const svgEl = svg.documentElement;
    svgEl.style.maxHeight = `${this.owner.plugin.settings.containerHeight}px`;
    svgEl.style.maxWidth = "100%";
    svgEl.style.height = "fit-content";
    svgEl.style.width = "fit-content";

    this.formatLinks(svgEl);
    containerEl.innerHTML = this.sanitizeSVGIDs(svgEl, docId);
  }

  private async render(source: string, signal: AbortSignal) {
    const el = this.containerEl;
    try {
      const image = await this.owner.renderer.render(
        source,
        this.owner.plugin.settings,
        signal
      );
      if (signal.aborted) return;
      el.empty();
      this.previousImage = image;
      this.insertImage(image, el, this.docId);

      const button = new ButtonComponent(el)
        .setClass("Preview__Recompile")
        .setIcon("recompile")
        .onClick((e) => {
          e.preventDefault();
          e.stopPropagation();
          this.update(source);
        });
      button.buttonEl.createEl("span", { text: "Recompile" });
    } catch (error) {
      if (signal.aborted) return;
      el.empty();
      const errorEl = el.createEl("pre", { cls: "markdown-rendered pre Preview__Error" });
      errorEl.createEl("code", {
        text: "D2 Compilation Error:",
        cls: "Preview__Error--Title",
      });
      errorEl.createEl("code", {
        text: error instanceof Error ? error.message : String(error),
      });
      if (this.previousImage) this.insertImage(this.previousImage, el, this.docId);
    }
  }
}
