const esbuild = require('esbuild')

esbuild
  .build({
    entryPoints: ['src/index.mjs'],
    // outdir: 'lib',
    outfile: 'lib/index.cjs.js',
    bundle: true,
    // sourcemap: true,
    // minify: true,
    platform: 'node',
    target: ['node10.4'],
  })
  .catch(() => process.exit(1))
