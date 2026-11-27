import { execFile, spawn } from "child_process";
import { delimiter, dirname, join, resolve } from "path";
import which from "which";

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
  signal: AbortSignal,
  notePath?: string
): Promise<string | undefined> {
  const paths = await (searchPath ??= cliSearchPath());
  if (signal.aborted) throw new Error("Render cancelled");
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: [settings.d2Path, ...paths].filter(Boolean).join(delimiter),
  };
  // Resolve the executable before changing the child working directory to the note.
  const found = await which("d2", { path: env.PATH, nothrow: true });
  if (!found) return undefined;
  const executable = resolve(found);
  if (settings.apiToken) env.TSTRUCT_TOKEN = settings.apiToken;
  const args = ["-", "--bundle=false", "--scale=1"];
  if (settings.theme !== null) args.push(`--theme=${settings.theme}`);
  if (settings.layoutEngine !== null) args.push(`--layout=${settings.layoutEngine}`);
  if (settings.pad !== null) args.push(`--pad=${settings.pad}`);
  if (settings.sketch !== null) args.push(`--sketch=${settings.sketch}`);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: notePath ? dirname(notePath) : undefined,
      env,
      signal,
    });
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
