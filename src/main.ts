import { Plugin, addIcon } from "obsidian";

import { D2PluginSettings, D2SettingsTab, DEFAULT_SETTINGS } from "./settings";
import { D2Processor } from "./processor";
import { RecompileIcon } from "./constants";
import { formatD2BlockCommand } from "./format";

export default class D2Plugin extends Plugin {
  settings: D2PluginSettings;
  processor: D2Processor;

  async onload() {
    addIcon("recompile", RecompileIcon);
    await this.loadSettings();
    this.addSettingTab(new D2SettingsTab(this.app, this));

    const processor = new D2Processor(this);
    this.registerMarkdownCodeBlockProcessor("d2", processor.attemptExport);
    this.addCommand(formatD2BlockCommand(processor.renderer));

    this.processor = processor;
  }

  onunload() {
    this.processor?.dispose();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
