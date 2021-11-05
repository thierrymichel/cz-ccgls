const npsUtils = require('nps-utils')

module.exports = {
  scripts: {
    // Build
    clean: {
      script: 'rimraf lib node_modules/.cache',
      description: '[build] clean lib / npm cache',
      hiddenFromHelp: true,
    },
    build: {
      cjs: {
        script: 'node ./build/esbuild.cjs.js',
        description: '[build] build CommonJS version',
        hiddenFromHelp: true,
      },
      esm: {
        script:
          'ncp src/index.mjs lib/index.mjs && ncp src/gitmojis.mjs lib/gitmojis.mjs',
        description: '[build] build ES Module version',
        hiddenFromHelp: true,
      },
      default: {
        script: npsUtils.series.nps('clean', 'build.cjs', 'build.esm'),
        description: '[build] build lib',
      },
    },
  },
}
