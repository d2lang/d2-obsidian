import { App, TFile } from "obsidian";
import type { CompileOptions, D2 } from "@d2lang/d2";
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
    const compiler = await this.getCompiler(signal);
    const layout = settings.layoutEngine;
    const { diagram, renderOptions } = await this.compile(
      compiler,
      source,
      sourcePath,
      signal,
      {
        layout:
          layout === "elk" || layout === "tala" || layout === "dagre"
            ? layout
            : undefined,
        themeID: settings.theme ?? undefined,
        pad: settings.pad ?? undefined,
        sketch: settings.sketch ?? undefined,
        scale: 1,
      }
    );
    if (this.disposed || signal.aborted) throw new Error("Render cancelled");
    // D2 resolves the interval from the diagram. Only animated SVGs accept a target of "*".
    if ((renderOptions.animateInterval ?? 0) > 0) renderOptions.target = "*";
    return compiler.render(diagram, renderOptions);
  }

  private async compile(
    compiler: D2,
    source: string,
    sourcePath: string | undefined,
    signal: AbortSignal,
    options: CompileOptions
  ) {
    if (!sourcePath) return compiler.compile(source, options);
    const fs: Record<string, string> = { [sourcePath]: source };
    while (!signal.aborted && !this.disposed) {
      try {
        return await compiler.compile({ fs, inputPath: sourcePath }, options);
      } catch (error) {
        let added = false;
        for (const path of missingImports(error)) {
          if (signal.aborted || this.disposed) throw new Error("Render cancelled");
          if (Object.prototype.hasOwnProperty.call(fs, path)) continue;
          const file = this.app.vault.getAbstractFileByPath(path);
          if (!(file instanceof TFile)) continue;
          fs[path] = await this.app.vault.cachedRead(file);
          added = true;
        }
        if (!added) throw error;
      }
    }
    throw new Error("Render cancelled");
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

// D2.js 0.2 reports unresolved imports in its compiler diagnostics. Let D2 resolve
// quoting, selectors and relative paths, then give its virtual filesystem only the
// vault files requested by this block and its transitive imports.
function missingImports(error: unknown): Set<string> {
  const paths = new Set<string>();
  if (!(error instanceof Error)) return paths;
  try {
    const diagnostics: { errmsg: string }[] = JSON.parse(error.message);
    for (const { errmsg } of diagnostics) {
      const match = /: failed to import ("(?:\\.|[^"\\])*"): file does not exist$/.exec(
        errmsg
      );
      if (!match) continue;
      const path: string = JSON.parse(match[1]);
      if (
        path.endsWith(".d2") &&
        !path.startsWith("/") &&
        !/^[a-z]:/i.test(path) &&
        !path.includes("\\") &&
        !path.split("/").includes("..")
      ) {
        paths.add(path);
      }
    }
  } catch {
    // Non-diagnostic SDK errors should propagate to the note unchanged.
  }
  return paths;
}
