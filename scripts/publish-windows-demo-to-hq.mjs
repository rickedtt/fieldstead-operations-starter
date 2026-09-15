import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const artifact = resolve(root, "release/Fieldstead Golden Client Prototype-Portable-0.2.0-x64.exe");
const destinations = [
  resolve(root, "../../fieldstead-systems-hq-plugin/dashboard/downloads/Fieldstead Golden Client Prototype-Portable-0.2.0-x64.exe"),
  resolve(process.env.HERMES_HOME || "/home/kn4ewt/.hermes", "plugins/fieldstead-systems-hq/dashboard/downloads/Fieldstead Golden Client Prototype-Portable-0.2.0-x64.exe"),
];

const size = statSync(artifact).size;
for (const destination of destinations) {
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(artifact, destination);
  console.log(`Published ${size} bytes to ${destination}`);
}
