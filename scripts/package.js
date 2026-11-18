// Builds the renderer and packages Glide into out/Glide-win32-x64.
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

(async () => {
  const { packager } = await import('@electron/packager');
  console.log('› building renderer');
  execSync('node node_modules/vite/bin/vite.js build --config vite.config.mjs', { cwd: ROOT, stdio: 'inherit' });

  const keepTop = new Set(['dist', 'electron', 'assets', 'node_modules', 'package.json']);
  const keepModules = /^\/node_modules\/(koffi|@koromix)(\/|$)/;

  console.log('› packaging');
  const out = await packager({
    dir: ROOT,
    out: path.join(ROOT, 'out'),
    overwrite: true,
    platform: 'win32',
    arch: 'x64',
    name: 'Glide',
    executableName: 'Glide',
    appVersion: require(path.join(ROOT, 'package.json')).version,
    icon: path.join(ROOT, 'assets', 'icon.ico'),
    asar: { unpack: '{**/*.node,**/helper/*.exe}' },
    prune: false,
    ignore: (p) => {
      if (!p) return false;
      const top = p.split('/')[1];
      if (!keepTop.has(top)) return true;
      if (top === 'node_modules') return !(p === '/node_modules' || keepModules.test(p) || p === '/node_modules/@koromix');
      return false;
    },
    win32metadata: { CompanyName: 'Leon Lin', FileDescription: 'Glide', ProductName: 'Glide', InternalName: 'Glide' },
  });
  console.log('› done:', out.join(', '));
  const unpacked = path.join(out[0], 'resources', 'app.asar.unpacked');
  console.log('› native modules unpacked:', fs.existsSync(unpacked) ? 'yes' : 'NO');
})().catch((e) => { console.error(e); process.exit(1); });
