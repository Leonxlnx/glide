// Compiles electron/helper/GlideMedia.cs with the .NET Framework compiler that ships with Windows.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const win = process.env.WINDIR || 'C:\\Windows';
const fw = path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
const csc = path.join(fw, 'csc.exe');
const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata';
const winmd = fs.existsSync(kits)
  ? fs.readdirSync(kits).filter((d) => /^\d/.test(d)).sort().reverse().map((d) => path.join(kits, d, 'Windows.winmd')).find((f) => fs.existsSync(f))
  : null;
if (!winmd) throw new Error('Windows SDK metadata (Windows.winmd) not found');

const facades = path.join('C:\\Program Files (x86)\\Reference Assemblies\\Microsoft\\Framework\\.NETFramework');
const facadeDir = fs.existsSync(facades)
  ? fs.readdirSync(facades).filter((d) => /^v4\.\d/.test(d)).sort().reverse().map((d) => path.join(facades, d, 'Facades')).find((f) => fs.existsSync(path.join(f, 'System.Runtime.dll')))
  : null;

const out = path.join(__dirname, '..', 'electron', 'helper', 'glide-media.exe');
const refs = [winmd, path.join(fw, 'System.Runtime.WindowsRuntime.dll')];
if (facadeDir) refs.push(path.join(facadeDir, 'System.Runtime.dll'));
else refs.push(path.join(fw, 'System.Runtime.dll'));

const args = ['/nologo', '/optimize+', '/target:exe', '/platform:anycpu', `/out:${out}`, ...refs.map((r) => `/r:${r}`), path.join(__dirname, '..', 'electron', 'helper', 'GlideMedia.cs')];
console.log(execFileSync(csc, args, { encoding: 'utf8' }));
console.log('built', out, fs.statSync(out).size, 'bytes');
