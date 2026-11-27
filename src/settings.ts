import { Notice, App, PluginSettingTab, Setting } from "obsidian";

import D2Plugin from "./main";
import { LAYOUT_ENGINES } from "./constants";

export interface D2PluginSettings {
  layoutEngine: string | null;
  debounce: number;
  theme: number | null;
  pad: number | null;
  sketch: boolean | null;
  containerHeight: number;
}

export const DEFAULT_SETTINGS: D2PluginSettings = {
  layoutEngine: null,
  debounce: 500,
  theme: null,
  pad: null,
  sketch: null,
  containerHeight: 800,
};

export class D2SettingsTab extends PluginSettingTab {
  plugin: D2Plugin;

  constructor(app: App, plugin: D2Plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h1", { text: "D2 plugin settings" });

    new Setting(containerEl)
      .setName("Layout engine")
      .setDesc(
        "Follow each diagram’s D2 configuration or override the layout for this vault."
      )
      .addDropdown((dropdown) => {
        dropdown
          .addOption("", "Use diagram setting")
          .addOption(LAYOUT_ENGINES.DAGRE.value, LAYOUT_ENGINES.DAGRE.label)
          .addOption(LAYOUT_ENGINES.ELK.value, LAYOUT_ENGINES.ELK.label)
          .addOption(LAYOUT_ENGINES.TALA.value, LAYOUT_ENGINES.TALA.label)
          .setValue(this.plugin.settings.layoutEngine ?? "")
          .onChange(async (value) => {
            this.plugin.settings.layoutEngine = value || null;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Theme ID")
      .setDesc(
        "Leave blank to use each diagram’s theme. Enter a D2 theme ID to override it for this vault."
      )
      .addText((text) =>
        text
          .setPlaceholder("Use diagram setting")
          .setValue(this.plugin.settings.theme?.toString() ?? "")
          .onChange(async (value) => {
            if (Number.isSafeInteger(Number(value))) {
              this.plugin.settings.theme = value.trim() ? Number(value) : null;
              await this.plugin.saveSettings();
            } else {
              new Notice("Please specify a valid number");
            }
          })
      );

    new Setting(containerEl)
      .setName("Pad")
      .setDesc(
        "Leave blank to use each diagram’s padding, or enter the number of pixels to use."
      )
      .addText((text) =>
        text
          .setPlaceholder("Use diagram setting")
          .setValue(this.plugin.settings.pad?.toString() ?? "")
          .onChange(async (value) => {
            if (!Number.isSafeInteger(Number(value))) {
              new Notice("Please specify a whole number");
              return;
            }
            this.plugin.settings.pad = value.trim() ? Number(value) : null;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sketch mode")
      .setDesc(
        "Follow each diagram’s sketch setting or choose a drawing style for this vault."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("", "Use diagram setting")
          .addOption("true", "Sketch")
          .addOption("false", "Standard")
          .setValue(this.plugin.settings.sketch?.toString() ?? "")
          .onChange(async (value) => {
            this.plugin.settings.sketch = value === "" ? null : value === "true";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Container height")
      .setDesc("Maximum diagram height in pixels")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.containerHeight))
          .setValue(String(this.plugin.settings.containerHeight))
          .onChange(async (value) => {
            if (isNaN(Number(value))) {
              new Notice("Please specify a valid number");
              this.plugin.settings.containerHeight = Number(
                DEFAULT_SETTINGS.containerHeight
              );
            } else if (value === "") {
              this.plugin.settings.containerHeight = Number(
                DEFAULT_SETTINGS.containerHeight
              );
            } else {
              this.plugin.settings.containerHeight = Number(value);
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Debounce")
      .setDesc("How often should the diagram refresh in milliseconds (min 100)")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.debounce))
          .setValue(String(this.plugin.settings.debounce))
          .onChange(async (value) => {
            if (isNaN(Number(value))) {
              new Notice("Please specify a valid number");
              this.plugin.settings.debounce = Number(DEFAULT_SETTINGS.debounce);
            } else if (value === "") {
              this.plugin.settings.debounce = Number(DEFAULT_SETTINGS.debounce);
            } else if (Number(value) < 100) {
              new Notice("The value must be greater than 100");
              this.plugin.settings.debounce = Number(DEFAULT_SETTINGS.debounce);
            } else {
              this.plugin.settings.debounce = Number(value);
            }
            await this.plugin.saveSettings();
          })
      );
  }
}
