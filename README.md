<div align="center">
  <img src="./docs/assets/banner.png" alt="D2" />
  <h2>
    D2 Obsidian Plugin
  </h2>

D2 is a modern diagram scripting language that turns text into diagrams. The source code for D2, as well as install instructions and all other information, can be found at
[https://github.com/d2lang/d2](https://github.com/d2lang/d2).

[![ci](https://github.com/d2lang/d2-obsidian/actions/workflows/ci.yml/badge.svg)](https://github.com/d2lang/d2-obsidian/actions/workflows/ci.yml)
[![ci](https://github.com/d2lang/d2-obsidian/actions/workflows/daily.yml/badge.svg)](https://github.com/d2lang/d2-obsidian/actions/workflows/daily.yml)
[![license](https://img.shields.io/github/license/d2lang/d2-obsidian?color=9cf)](./LICENSE.txt)
[![discord](https://img.shields.io/discord/1039184639652265985?label=discord)](https://discord.gg/NF6X8K4eDq)

https://user-images.githubusercontent.com/6413609/205414613-5b2559f1-0645-4432-bb7b-d980de527201.mp4

</div>

## Installation

In Obsidian, open **Settings → Community plugins → Browse**, search for **D2**, then select **Install** and **Enable**.

Write a fenced `d2` block in a note to see it rendered in Live Preview or Reading view. The plugin includes an offline compiler with the Dagre, ELK, and TALA layouts on desktop, iPhone, iPad, and Android.

To format the D2 source, place the cursor in the block while editing the note and run **D2: Format D2 Block** from the command palette. The command also works offline on mobile.

On desktop, the plugin uses your installed D2 CLI when available. This preserves your CLI version, local filesystem access, and TALA installation. Mobile always uses the bundled compiler, including for TALA, with no token required. The bundled compiler renders the contents of each block and cannot import files from disk.

If you use Obsidian Sync Standard, install or update D2 from Community plugins on each device. The bundled compiler exceeds that plan’s [5 MB per-file limit](https://obsidian.md/help/sync/plans).

## Configurations

- `Layout engine`: D2 supports multiple layout engines, which can significantly affect the look of your diagram.
- `Theme ID`: For a list of available themes, visit the [D2 repository](https://github.com/d2lang/d2/tree/master/d2themes).
- `Pad`: Number of pixels padded around the rendered diagram.
- `Sketch mode`: Render the diagram to look like it was sketched by hand.
- `Container height`: Diagram max render height in pixels (Requires d2 v0.2.2 and up).
- `Debounce`: Number of milliseconds to wait after a change has made to refresh the diagram (min 100).
- `Path` (desktop): Set the directory containing your D2 executable if the plugin cannot find it automatically.

## Usage

Create a fenced codeblock with `d2` as the language tag:

```d2
Hello -> World
```

## How to run this plugin locally

- Clone this repo.
- Run `yarn` to install dependencies.
- Run `yarn run dev` to start compilation in watch mode.
- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `[VaultFolder]/.obsidian/plugins/d2-obsidian/`.

Run the mobile regression test with `yarn build`, `yarn playwright-core install webkit`, and `yarn test:mobile`. The [compiler build instructions](./vendor/README.md) explain how to regenerate the bundled D2 dependency.

## FAQ

- How do I use an installed D2 CLI or TALA on desktop?
  - Set **Path** to the directory containing the `d2` executable, for example `/usr/local/bin`. Older CLI versions may need a separate TALA installation. Clear **Path** to allow the bundled fallback.
- I have a question or need help.
  - The best way to get help is to ask on [D2 Discord](https://discord.gg/NF6X8K4eDq).
- I'd like to contribute.
  - We welcome contributions! Please pick one from an existing Issue, or open one if none exists.
- I have a feature request, proposal, or bug report.
  - Please open up a Github Issue. If it's D2-specific, please open it in the [D2 repository](https://github.com/d2lang/d2). If it's specific to this plugin, please [open it here](https://github.com/d2lang/d2-obsidian/issues).
- I have a private inquiry.
  - Please reach out at [hi@d2lang.com](hi@d2lang.com).
