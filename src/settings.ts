import { Notice, App, Platform, PluginSettingTab, Setting } from "obsidian";

import D2Plugin from "./main";
import { LAYOUT_ENGINES } from "./constants";

export interface D2PluginSettings {
  layoutEngine: string;
  apiToken: string;
  debounce: number;
  theme: number;
  d2Path: string;
  pad: number;
  sketch: boolean;
  containerHeight: number;
}

export const DEFAULT_SETTINGS: D2PluginSettings = {
  layoutEngine: "dagre",
  debounce: 500,
  theme: 0,
  apiToken: "",
  d2Path: "",
  pad: 100,
  sketch: false,
  containerHeight: 800,
};

export class D2SettingsTab extends PluginSettingTab {
  plugin: D2Plugin;

  constructor(app: App, plugin: D2Plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  addTALASettings() {
    const talaSettings = this.containerEl.createEl("div");
    talaSettings.createEl("h3", {
      text: "TALA settings",
    });
    new Setting(talaSettings)
      .setName("API token")
      .setDesc(
        "Only older desktop TALA installations require a token. The bundled TALA layout works offline without one."
      )
      .addText((text) =>
        text
          .setPlaceholder("tstruct_...")
          .setValue(this.plugin.settings.apiToken)
          .setDisabled(this.plugin.settings.layoutEngine !== LAYOUT_ENGINES.TALA.value)
          .onChange(async (value) => {
            if (value && !value.startsWith("tstruct_")) {
              new Notice("Invalid API token");
            } else {
              this.plugin.settings.apiToken = value;
              await this.plugin.saveSettings();
            }
          })
      );
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h1", { text: "D2 plugin settings" });

    new Setting(containerEl)
      .setName("Layout engine")
      .setDesc("Dagre, ELK, and TALA are included in the bundled compiler.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption(LAYOUT_ENGINES.DAGRE.value, LAYOUT_ENGINES.DAGRE.label)
          .addOption(LAYOUT_ENGINES.ELK.value, LAYOUT_ENGINES.ELK.label)
          .addOption(LAYOUT_ENGINES.TALA.value, LAYOUT_ENGINES.TALA.label)
          .setValue(this.plugin.settings.layoutEngine)
          .onChange(async (value) => {
            this.plugin.settings.layoutEngine = value;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("Theme ID")
      .setDesc(
        "Available themes are located at https://github.com/d2lang/d2/tree/master/d2themes"
      )
      .addText((text) =>
        text
          .setPlaceholder("Enter a theme ID")
          .setValue(String(this.plugin.settings.theme))
          .onChange(async (value) => {
            if (!isNaN(Number(value)) || value === "") {
              this.plugin.settings.theme = Number(value || DEFAULT_SETTINGS.theme);
              await this.plugin.saveSettings();
            } else {
              new Notice("Please specify a valid number");
            }
          })
      );

    new Setting(containerEl)
      .setName("Pad")
      .setDesc("Pixels padded around the rendered diagram")
      .addText((text) =>
        text
          .setPlaceholder(String(DEFAULT_SETTINGS.pad))
          .setValue(String(this.plugin.settings.pad))
          .onChange(async (value) => {
            if (isNaN(Number(value))) {
              new Notice("Please specify a valid number");
              this.plugin.settings.pad = Number(DEFAULT_SETTINGS.pad);
            } else if (value === "") {
              this.plugin.settings.pad = Number(DEFAULT_SETTINGS.pad);
            } else {
              this.plugin.settings.pad = Number(value);
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Sketch mode")
      .setDesc("Render the diagram to look like it was sketched by hand")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.sketch).onChange(async (value) => {
          this.plugin.settings.sketch = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Container height")
      .setDesc("Diagram max render height in pixels (Requires d2 v0.2.2 and up)")
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

    if (!Platform.isDesktopApp) return;

    new Setting(containerEl)
      .setName("Path (optional)")
      .setDesc(
        "Directory containing your local D2 executable, for example /usr/local/bin. Leave empty to detect D2 automatically and use the bundled compiler when it is unavailable."
      )
      .addText((text) => {
        text
          .setPlaceholder("/usr/local/Cellar")
          .setValue(this.plugin.settings.d2Path)
          .onChange(async (value) => {
            this.plugin.settings.d2Path = value;
            await this.plugin.saveSettings();
          });
      });

    if (this.plugin.settings.layoutEngine === LAYOUT_ENGINES.TALA.value) {
      this.addTALASettings();
    }
  }
}
