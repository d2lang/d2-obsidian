import { Platform } from "obsidian";
import type { D2 } from "@d2lang/d2";
import type { D2PluginSettings } from "./settings";

export class D2Renderer {
  private compiler?: D2;
  private disposed = false;

  async render(
    source: string,
    settings: D2PluginSettings,
    signal: AbortSignal
  ): Promise<string> {
    if (this.disposed || signal.aborted) throw new Error("Render cancelled");
    if (Platform.isDesktopApp) {
      const { renderCLI } = await import("./cli");
      try {
        return await renderCLI(source, settings, signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (settings.d2Path) {
          throw new Error(
            "D2 was not found. Check the configured D2 path, or clear it to use the bundled compiler."
          );
        }
      }
    }

    const { D2 } = await import("@d2lang/d2");
    if (this.disposed || signal.aborted) throw new Error("Render cancelled");
    const compiler = (this.compiler ??= new D2());
    return compiler.renderSVG(source, {
      layout:
        settings.layoutEngine === "elk" || settings.layoutEngine === "tala"
          ? settings.layoutEngine
          : "dagre",
      themeID: settings.theme,
      pad: settings.pad,
      sketch: settings.sketch,
      scale: 1,
    });
  }

  dispose() {
    this.disposed = true;
    void this.compiler?.dispose();
  }
}
