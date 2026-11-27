import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const root = import.meta.dirname;

// Icon barrels pull in thousands of modules (slow builds); import each icon directly.
function directIcons() {
  const kebab = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([a-zA-Z])(\d)/g, '$1-$2').toLowerCase();
  const phosphor = resolve(root, 'node_modules/@phosphor-icons/react/dist/csr').replace(/\\/g, '/');
  return {
    name: 'direct-icons',
    enforce: 'pre',
    transform(code, id) {
      if (!/\/src\/.*\.jsx?$/.test(id.replace(/\\/g, '/'))) return null;
      let out = code;
      if (out.includes("'lucide-react'")) {
        out = out.replace(/import\s*\{([^}]+)\}\s*from\s*'lucide-react';?/g, (_, names) => names
          .split(',').map((s) => s.trim()).filter(Boolean)
          .map((spec) => { const [o, a] = spec.split(/\s+as\s+/); return `import ${a || o} from 'lucide-react/dist/esm/icons/${kebab(o)}.mjs';`; }).join('\n'));
      }
      if (out.includes("'@phosphor-icons/react'")) {
        out = out.replace(/import\s*\{([^}]+)\}\s*from\s*'@phosphor-icons\/react';?/g, (_, names) => names
          .split(',').map((s) => s.trim()).filter(Boolean)
          .map((spec) => { const [o, a] = spec.split(/\s+as\s+/); return `import { ${o}${a ? ' as ' + a : ''} } from '${phosphor}/${o}.es.js';`; }).join('\n'));
      }
      return out === code ? null : out;
    },
  };
}

export default defineConfig({
  root: resolve(root, 'src'),
  base: './',
  plugins: [directIcons(), react()],
  resolve: { alias: { 'lucide-react/dist': resolve(root, 'node_modules/lucide-react/dist') } },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    target: 'chrome130',
    assetsInlineLimit: 0,
    reportCompressedSize: false,
    rollupOptions: {
      input: {
        sidebar: resolve(root, 'src/sidebar.html'),
        handle: resolve(root, 'src/handle.html'),
        editor: resolve(root, 'src/editor.html'),
      },
    },
  },
  server: { port: 5199, strictPort: true },
});
