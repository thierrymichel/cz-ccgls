const esbuild = require('esbuild')

const NodeCoreModulesPlugin = {
  name: 'esbuild-node-core-modules-plugin',
  setup(build) {
    // Redirect all NodeJS core modules (node:*) to legacy path (*) and mark them as external
    build.onResolve({ filter: /^node:/ }, args => ({
      path: args.path.replace(/^node:/, ''),
      external: true,
    }))
  },
}

esbuild
  .build({
    entryPoints: ['src/index.mjs'],
    outfile: 'lib/index.cjs.js',
    bundle: true,
    platform: 'node',
    target: ['node10.4'],
    format: 'cjs',
    external: ['node'],
    plugins: [NodeCoreModulesPlugin],
  })
  .catch(() => process.exit(1))
