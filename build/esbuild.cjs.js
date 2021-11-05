const esbuild = require('esbuild')

esbuild
  .build({
    entryPoints: ['src/index.mjs'],
    outfile: 'lib/index.cjs.js',
    bundle: true,
    platform: 'node',
    target: ['node10.4'],
    format: 'cjs',
    external: ['node'],
  })
  .catch(() => process.exit(1))
