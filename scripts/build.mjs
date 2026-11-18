import { build } from 'esbuild';

const browserEntries = [
  ['src/page.ts', 'panel/page.js'],
  ['src/panel.ts', 'panel/main.js'],
];

for (const [entry, outfile] of browserEntries) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    legalComments: 'none',
    logLevel: 'warning',
  });
}

// The tasks service runs under the app's own Node runtime, not a browser
// sandbox — same `--node` settings the SDK's own bundler uses for a service
// entry (ESM, Node platform, Node built-ins left as plain imports). Whitespace
// is minified to keep dependency-layout paths (npm vs pnpm) out of the bundle;
// identifiers and syntax stay intact, and generated output is CI-verified.
await build({
  entryPoints: ['service/main.ts'],
  outfile: 'service/main.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node18',
  minify: false,
  minifyWhitespace: true,
  legalComments: 'none',
  logLevel: 'warning',
});

console.log(`built ${browserEntries.map(([, out]) => out).join(', ')}, service/main.js`);
