import { App, FileSystemAdapter, Platform } from "obsidian";
import type { D2 } from "@d2lang/d2";
import type { D2PluginSettings } from "./settings";

export class D2Renderer {
  private compiler?: D2;
  private disposed = false;

  constructor(private readonly app: App) {}

  async render(
    source: string,
    settings: D2PluginSettings,
    signal: AbortSignal,
    sourcePath?: string
  ): Promise<string> {
    if (this.disposed || signal.aborted) throw new Error("Render cancelled");
    if (Platform.isDesktopApp) {
      const { renderCLI } = await import("./cli");
      const adapter = this.app.vault.adapter;
      const notePath =
        sourcePath && adapter instanceof FileSystemAdapter
          ? adapter.getFullPath(sourcePath)
          : undefined;
      const svg = await renderCLI(source, settings, signal, notePath);
      if (svg !== undefined) return svg;
      if (settings.d2Path) {
        throw new Error(
          "D2 was not found. Check the configured D2 path, or clear it to use the bundled compiler."
        );
      }
    }

    const compiler = await this.getCompiler(signal);
    const layout = settings.layoutEngine;
    const { diagram, renderOptions } = await compiler.compile(source, {
      layout:
        layout === "elk" || layout === "tala" || layout === "dagre" ? layout : undefined,
      themeID: settings.theme ?? undefined,
      pad: settings.pad ?? undefined,
      sketch: settings.sketch ?? undefined,
      scale: 1,
    });
    if (this.disposed || signal.aborted) throw new Error("Render cancelled");
    // D2 resolves the interval from the diagram. Only animated SVGs accept a target of "*".
    if ((renderOptions.animateInterval ?? 0) > 0) renderOptions.target = "*";
    return compiler.render(diagram, renderOptions);
  }

  async format(source: string): Promise<string> {
    const compiler = await this.getCompiler();
    return compiler.format(source);
  }

  private async getCompiler(signal?: AbortSignal): Promise<D2> {
    const { D2 } = await import("@d2lang/d2");
    if (this.disposed || signal?.aborted) throw new Error("D2 operation cancelled");
    return (this.compiler ??= new D2());
  }

  dispose() {
    this.disposed = true;
    void this.compiler?.dispose();
  }
}
