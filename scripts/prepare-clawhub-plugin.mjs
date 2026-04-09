import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outputRoot = join(repoRoot, ".clawhub-plugin", "openclaw-onebot-plugin");

const basePackage = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(join(repoRoot, "openclaw.plugin.json"), "utf8"));

const releasePackage = {
  name: "openclaw-onebot-plugin",
  displayName: "OpenClaw OneBot Plugin",
  version: basePackage.version,
  description: basePackage.description,
  type: basePackage.type,
  main: basePackage.main,
  types: basePackage.types,
  repository: basePackage.repository,
  homepage: basePackage.homepage,
  bugs: basePackage.bugs,
  author: basePackage.author,
  license: basePackage.license,
  openclaw: basePackage.openclaw,
  dependencies: basePackage.dependencies,
  bundledDependencies: basePackage.bundledDependencies,
  bundleDependencies: basePackage.bundleDependencies,
  peerDependencies: basePackage.peerDependencies,
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

await cp(join(repoRoot, "dist"), join(outputRoot, "dist"), { recursive: true });
await cp(join(repoRoot, "scripts"), join(outputRoot, "scripts"), { recursive: true });
await cp(join(repoRoot, "LICENSE"), join(outputRoot, "LICENSE"));
await cp(join(repoRoot, "README.md"), join(outputRoot, "README.md"));
await cp(join(repoRoot, "openclaw.plugin.json"), join(outputRoot, "openclaw.plugin.json"));

await writeFile(join(outputRoot, "package.json"), `${JSON.stringify(releasePackage, null, 2)}\n`);

const summary = {
  output: outputRoot,
  packageName: releasePackage.name,
  displayName: releasePackage.displayName,
  runtimeId: manifest.id,
  version: releasePackage.version,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
