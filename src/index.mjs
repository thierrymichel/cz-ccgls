import fs from 'fs'
import path from 'path'

import autocomplete from 'inquirer-autocomplete-prompt'
import fuzzy from 'fuzzy'
import importFrom from 'import-from'
import longest from 'longest'
import map from 'lodash.map'
import { readPackageUp } from 'read-pkg-up'
import rightPad from 'right-pad'
import wrap from 'wrap-ansi'

import { getEmojis } from './gitmojis.mjs'

// https://www.stefanjudis.com/snippets/how-to-import-json-files-in-es-modules-node-js/
import { createRequire } from 'module'
const requireJSON = createRequire(
  import.meta.url || path.resolve(__dirname, '../node_modules') // CJS support
)
const types = requireJSON('conventional-commit-types')

const conventionalTypes = types.types
const cwd = process.cwd()
const defaultConfig = {
  additionalTypes: {
    imp: {
      description:
        'Improves a current implementation without adding a new feature or fixing a bug',
      title: 'Improvement',
    },
  },
  useEmojis: true,
  additionalEmojis: [],
  useScopes: true,
  useLernaScopes: false,
  useFolderScopes: false,
  folderRoot: '.',
  folderIgnore: [],
  additionalScopes: [],
  // You can use yours
  // types: {},
  // emojis: [],
  // scopes: [],
}

/**
 * Truncate string
 *
 * @param {string} str original string
 * @param {number} length max length
 * @returns {string} truncated string
 */
function truncate(str, length) {
  if (str.length <= length) {
    return str
  }

  return `${str.slice(0, length - 1)}…`
}

/**
 * Load configuration form package.json or .czrc
 *
 * @returns {object} configuration
 */
function loadConfig() {
  const getConfig = obj => obj && obj.config && obj.config['cz-ccgls']

  // Start with `package.json`
  return (
    readPackageUp()
      .then(({ packageJson: pkg }) => {
        const config = getConfig(pkg)

        if (config) {
          return config
        }

        // If no config, look after `.czrc`
        return new Promise(resolve => {
          fs.readFile(path.resolve(cwd, '.czrc'), 'utf8', (err, content) => {
            if (err) {
              resolve({})

              return
            }

            const czrc = (content && JSON.parse(content)) || null

            resolve(getConfig(czrc))
          })
        })
      })
      // Merge with defaults
      .then(config => ({
        ...defaultConfig,
        ...config,
      }))
      .catch(() => defaultConfig)
  )
}

// eslint-disable-next-line require-jsdoc
async function loadOptions(config) {
  const options = {}

  // Types
  let types = config.types || conventionalTypes

  if (config.additionalTypes) {
    types = {
      ...types,
      ...config.additionalTypes,
    }
  }

  options.types = formatTypes(types)

  // Additional types
  // if (config.additionalTypes) {
  //   options.types = {
  //     ...options.types,
  //     ...config.additionalTypes,
  //   };
  // }

  // Gitmoji
  if (config.useEmojis) {
    let emojis = []

    if (config.emojis) {
      emojis = emojis.concat(config.emojis)
    } else {
      const gitmojis = await getEmojis()
      emojis = emojis.concat(gitmojis)
    }

    if (config.additionalEmojis) {
      emojis = emojis.concat(config.additionalEmojis)
    }

    options.emojis = formatEmojis(emojis)
  }

  // Load Lerna scopes if configured
  if (config.useScopes) {
    let scopes = []

    if (config.scopes) {
      scopes = scopes.concat(config.scopes)
    }

    if (config.useLernaScopes) {
      let Project = importFrom.silent(cwd, '@lerna/project')

      if (typeof Project === 'object' && Project.Project) {
        // eslint-disable-next-line no-extra-semi
        ;({ Project } = Project)
      }

      if (Project) {
        const project = new Project(cwd)
        const packages = await project.getPackages()
        const lernaScopes = packages
          .map(pkg => pkg.name)
          .map(name => (name.charAt(0) === '@' ? name.split('/')[1] : name))

        scopes = scopes.concat(lernaScopes)
      }
    }

    if (config.useFolderScopes) {
      const ignores = ['.git', 'node_modules'].concat(config.folderIgnore)
      const root = path.resolve(cwd, config.folderRoot)
      const folderScopes = fs
        .readdirSync(root, { withFileTypes: true })
        .filter(
          file =>
            file.isDirectory() &&
            !file.name.startsWith('.') &&
            !ignores.includes(file.name)
        )
        .map(file => file.name)
      scopes = scopes.concat(folderScopes)
    }

    options.scopes = [...scopes, ...config.additionalScopes]
  }

  return options
}

/**
 * Fill prompt for questions
 * 1. Type
 * 2. Scope
 * 3. Gitmoji
 * 4. Subject (short)
 * 5. Body (long)
 * 6. Breaking
 * 7. Issues
 *
 * @param {object} options from `loadOptions`
 * @return {array} list of questions
 */
function fillPrompt(options) {
  const { types, scopes, emojis } = options
  const prompts = [
    {
      type: 'autocomplete',
      name: 'type',
      // eslint-disable-next-line quotes
      message: "Select the type of change you're committing:",

      source: (_answersSoFar, input) => {
        const query = input || ''

        return new Promise(resolve => {
          const result = fuzzy.filter(query, types, {
            extract: el => el.name,
          })

          setTimeout(() => {
            resolve(result.map(el => el.original))
          }, 100)
        })
      },
    },
    {
      type: scopes ? 'list' : 'input',
      name: 'scope',
      message: 'Specify a scope:',
      choices:
        scopes &&
        [
          {
            name: '[none]',
            value: '',
          },
          {
            name: 'root',
            value: 'root',
          },
        ].concat(scopes),
    },
    {
      type: 'input',
      name: 'subject',
      message: 'Write a short description:\n',
    },
    {
      type: 'input',
      name: 'body',
      message: 'Provide a longer description:\n',
    },
    {
      type: 'confirm',
      name: 'isBreaking',
      message: 'Are there any breaking changes?',
      default: false,
    },
    {
      type: 'input',
      name: 'breaking',
      message: 'Describe the breaking changes:\n',
      when: answers => answers.isBreaking,
    },
    {
      type: 'input',
      name: 'issues',
      message: 'List any issue closed (#1, ...):',
    },
  ]

  if (emojis) {
    prompts.splice(2, 0, {
      type: 'autocomplete',
      name: 'emoji',
      message: 'Choose an emoji:',
      source: (answersSoFar, input) => {
        const query = input || ''

        return new Promise(resolve => {
          const result = fuzzy.filter(query, emojis, {
            extract: el => el.name,
          })

          setTimeout(() => {
            resolve(result.map(el => el.original))
          }, 100)
        })
      },
    })
  }

  return prompts
}

/**
 * Format the git commit message from given answers.
 *
 * @param {object} answers from prompt
 * @return {string} formated git commit message
 */
function format(answers) {
  // Optional scope with parenthesis
  const scope = answers.scope ? `(${answers.scope.trim()})` : ''
  // Optional subject with emoji
  const subject = answers.emoji ? `${answers.emoji} ${answers.subject}` : ''

  // Build head line, add emoji and limit to 100
  const head = truncate(`${answers.type}${scope}: ${subject.trim()}`, 100)
  const body = answers.body ? wrap(answers.body, 100) : ''
  const breaking = answers.breaking
    ? wrap(`BREAKING CHANGE: ${answers.breaking.trim()}`, 100)
    : ''
  const footer = (answers.issues.match(/#\d+/g) || [])
    // .map(issue => `Closes ${issue}`)
    .map(issue => `[#${issue}]`)
    .join('\n')

  return [head, body, breaking, footer]
    .filter(part => part.length > 0)
    .join('\n\n')
    .trim()
}

/**
 * Export `prompter` method for `commitizen`.
 */
export function prompter(cz, commit) {
  cz.prompt.registerPrompt('autocomplete', autocomplete)
  loadConfig()
    .then(loadOptions)
    .then(fillPrompt)
    .then(cz.prompt)
    .then(format)
    .then(commit)
}

/**
 * Get types for prompt
 * name: <type>: <description>
 * value: <type>
 * @param {object} types types to format
 * @returns {array} list of formatted types
 */
function formatTypes(types) {
  // Needed for alignment wit rightPad
  const length = longest(Object.keys(types)).length + 2

  return map(types, (item, key) => {
    const { description } = item

    return {
      name: `${rightPad(`${key}:`, length)} ${description}`,
      value: key,
    }
  })
}

/**
 * Get emojis for prompt
 * name: <symbol>: <description>
 * value: <code>
 * @param {array} emojis emojis to format
 * @returns {array} list of formatted emojis
 */
function formatEmojis(emojis) {
  // Needed for alignment wit rightPad
  // const length = longest(Object.keys(types)).length + 2;

  return emojis.map(item => {
    const { emoji, description } = item

    return {
      name: `${emoji}: ${description}`,
      value: emoji,
    }
  })
}
