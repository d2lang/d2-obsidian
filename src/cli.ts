import { execFile, spawn } from "child_process";
import { delimiter, join } from "path";

import type { D2PluginSettings } from "./settings";

let searchPath: Promise<string[]> | undefined;

async function cliSearchPath(): Promise<string[]> {
  const paths = [process.env.PATH || "", "/opt/homebrew/bin", "/usr/local/bin"];
  if (process.platform === "win32") {
    paths.push(join(process.env.ProgramFiles || "C:\\Program Files", "D2"));
  } else if (process.env.HOME) {
    paths.push(join(process.env.HOME, ".local", "bin"));
  }

  const goPath = await new Promise<string>((resolve) => {
    execFile(
      "go",
      ["env", "GOPATH"],
      { env: { ...process.env, PATH: paths.join(delimiter) } },
      (err, stdout) => resolve(err ? "" : stdout.trim())
    );
  });
  for (const path of goPath.split(delimiter).filter(Boolean)) {
    paths.push(join(path, "bin"));
  }
  return paths;
}

export async function renderCLI(
  source: string,
  settings: D2PluginSettings,
  signal: AbortSignal
): Promise<string> {
  const paths = await (searchPath ??= cliSearchPath());
  if (signal.aborted) throw new Error("Render cancelled");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: [settings.d2Path, ...paths].filter(Boolean).join(delimiter),
  };
  if (settings.apiToken) env.TSTRUCT_TOKEN = settings.apiToken;
  const args = [
    "-",
    `--theme=${settings.theme}`,
    `--layout=${settings.layoutEngine}`,
    `--pad=${settings.pad}`,
    `--sketch=${settings.sketch}`,
    "--bundle=false",
    "--scale=1",
  ];
  return new Promise((resolve, reject) => {
    const child = spawn("d2", args, { env, signal });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (data) => {
      stdout += data;
    });
    child.stderr.setEncoding("utf8").on("data", (data) => {
      stderr += data;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else
        reject(
          new Error(stderr.trim() || stdout.trim() || `D2 exited with code ${code}`)
        );
    });
    child.stdin.on("error", (err: NodeJS.ErrnoException) => {
      // A failed or cancelled compiler can close stdin before consuming the diagram.
      if (err.code !== "EPIPE") reject(err);
    });
    child.stdin.end(source);
  });
}
