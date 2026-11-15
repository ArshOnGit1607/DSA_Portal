// electron-builder afterPack hook. Without an Apple Developer ID the bundle is left with only the
// linker's signature on the executable, which macOS on Apple Silicon reports as "damaged".
// Ad-hoc signing the whole bundle makes the signature valid, so Gatekeeper offers "Open Anyway".
// shortcut: ad-hoc only, users still see the unverified-developer prompt; use a Developer ID + notarization to remove it.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = ({ electronPlatformName, appOutDir, packager }) => {
  if (electronPlatformName !== 'darwin') return;
  const app = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
