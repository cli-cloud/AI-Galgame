const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function main() {
  const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
  if (!fs.existsSync(electronDir)) return;

  const pathFile = path.join(electronDir, 'path.txt');
  const distDir = path.join(electronDir, 'dist');
  const platformPath = process.platform === 'darwin'
    ? 'Electron.app/Contents/MacOS/Electron'
    : (process.platform === 'win32' ? 'electron.exe' : 'electron');

  const electronExecutable = path.join(distDir, platformPath);

  if (!fs.existsSync(electronExecutable)) {
    console.log('Electron executable missing. Installing Electron binary...');
    try {
      const { downloadArtifact } = require('@electron/get');
      const electronPkg = require(path.join(electronDir, 'package.json'));
      const zipPath = await downloadArtifact({
        version: electronPkg.version,
        artifactName: 'electron',
        platform: process.platform,
        arch: process.arch
      });
      fs.mkdirSync(distDir, { recursive: true });
      if (process.platform === 'win32') {
        const extract = require('extract-zip');
        await extract(zipPath, { dir: distDir });
      } else {
        execSync(`unzip -o -q "${zipPath}" -d "${distDir}"`);
      }
    } catch (e) {
      console.error('Failed to auto-extract electron binary:', e);
    }
  }

  if (fs.existsSync(electronExecutable) && (!fs.existsSync(pathFile) || fs.readFileSync(pathFile, 'utf-8') !== platformPath)) {
    fs.writeFileSync(pathFile, platformPath, 'utf-8');
    console.log('Successfully set up Electron path.txt');
  }
}

main().catch(err => {
  console.error(err);
});
