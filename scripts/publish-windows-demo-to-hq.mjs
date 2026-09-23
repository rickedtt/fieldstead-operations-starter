import { copyFileSync, existsSync, mkdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const version = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).version;
const artifacts = [
  { role: 'primary', fileName: `Fieldstead Systems Operations Starter-Setup-${version}-x64.exe`, required: true },
  { role: 'diagnostic-fallback', fileName: `Fieldstead Systems Operations Starter-Portable-${version}-x64.exe`, required: true },
];

function updateDashboardReferences(destinationDirectory, published) {
  const dashboardDirectory = resolve(destinationDirectory, '..');
  const primary = published.find((artifact) => artifact.role === 'primary');
  const fallback = published.find((artifact) => artifact.role === 'diagnostic-fallback');
  const apiPath = resolve(dashboardDirectory, 'plugin_api.py');
  const indexPath = resolve(dashboardDirectory, 'dist', 'index.js');
  const apiSource = readFileSync(apiPath, 'utf8');
  const downloadBlock = `# FIELDSTEAD_WINDOWS_DOWNLOADS_START
@router.get("/windows/fieldstead-operations-starter-setup.exe")
def windows_installer_download():
    artifact = _PLUGIN_DIR / "downloads" / "${primary.fileName}"
    if not artifact.is_file():
        raise HTTPException(status_code=404, detail="Windows installer download not found")
    return FileResponse(artifact, media_type="application/vnd.microsoft.portable-executable", filename=artifact.name)


@router.get("/windows/fieldstead-golden-client-portable.exe")
def windows_portable_fallback_download():
    artifact = _PLUGIN_DIR / "downloads" / "${fallback.fileName}"
    if not artifact.is_file():
        raise HTTPException(status_code=404, detail="Portable diagnostic fallback not found")
    return FileResponse(artifact, media_type="application/vnd.microsoft.portable-executable", filename=artifact.name)
# FIELDSTEAD_WINDOWS_DOWNLOADS_END`;
  const markedBlock = /# FIELDSTEAD_WINDOWS_DOWNLOADS_START[\s\S]*?# FIELDSTEAD_WINDOWS_DOWNLOADS_END/;
  const legacyBlock = /@router\.get\("\/windows\/fieldstead-golden-client-portable\.exe"\)\ndef windows_demo_download\(\):\n(?:    .*\n){4}/;
  const updatedApi = markedBlock.test(apiSource)
    ? apiSource.replace(markedBlock, downloadBlock)
    : apiSource.replace(legacyBlock, downloadBlock);
  if (updatedApi === apiSource) throw new Error(`Could not update installer route in ${apiPath}`);
  writeFileSync(apiPath, updatedApi);

  const indexSource = readFileSync(indexPath, 'utf8');
  const resourcePattern = /^\s*\{ name: "Fieldstead Systems Operations Starter for Windows[^\n]+$/m;
  const replacement = [
    `      { name: "Fieldstead Systems Operations Starter for Windows v${version}", type: "EXE", note: "NSIS installer (primary) for normal Windows installation, shortcuts, upgrades, and uninstall.", url: "/api/plugins/fieldstead-systems-hq/windows/fieldstead-operations-starter-setup.exe", downloadName: "${primary.fileName}" },`,
    `      { name: "Fieldstead Operations Starter portable fallback v${version}", type: "EXE", note: "Portable diagnostic fallback; use the installer above for normal deployment.", url: "/api/plugins/fieldstead-systems-hq/windows/fieldstead-golden-client-portable.exe", downloadName: "${fallback.fileName}" },`,
  ].join('\n');
  if (!resourcePattern.test(indexSource)) throw new Error(`Could not update Windows resources in ${indexPath}`);
  writeFileSync(indexPath, indexSource.replace(resourcePattern, replacement));
}
const destinationDirectories = [
  resolve(root, `../fieldstead-systems-hq-plugin/dashboard/downloads`),
  resolve(process.env.HERMES_HOME || "/home/kn4ewt/.hermes", `plugins/fieldstead-systems-hq/dashboard/downloads`),
];

for (const destinationDirectory of destinationDirectories) {
  mkdirSync(destinationDirectory, { recursive: true });
  const published = [];
  for (const descriptor of artifacts) {
    const artifact = resolve(root, 'release', descriptor.fileName);
    if (!existsSync(artifact)) {
      if (descriptor.required) throw new Error(`Required installer is missing: ${artifact}`);
      published.push({ ...descriptor, available: false });
      continue;
    }
    const size = statSync(artifact).size;
    const destination = resolve(destinationDirectory, descriptor.fileName);
    copyFileSync(artifact, destination);
    published.push({ ...descriptor, available: true, size });
    console.log(`Published ${descriptor.role} artifact (${size} bytes) to ${destination}`);
  }
  writeFileSync(resolve(destinationDirectory, 'fieldstead-windows-release.json'), `${JSON.stringify({
    version,
    delivery: 'authenticated-dashboard',
    artifacts: published,
  }, null, 2)}\n`);
  updateDashboardReferences(destinationDirectory, published);
}
