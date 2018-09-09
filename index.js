const autocomplete = require('inquirer-autocomplete-prompt');
const fs = require('fs');
const fuzzy = require('fuzzy');
const importFrom = require('import-from');
const longest = require('longest');
const map = require('lodash.map');
const path = require('path');
const readPkg = require('read-pkg-up');
const rightPad = require('right-pad');
const truncate = require('cli-truncate');
const wrap = require('wrap-ansi');

const { types } = require('conventional-commit-types');
const emojis = require('./emojis');

const cwd = process.cwd();
const defaultConfig = {
  useScopes: true,
  scopes: [],
};

/**
 * Load configuration form package.json or .czrc
 *
 * @returns {object} configuration
 */
function loadConfig() {
  const getConfig = obj => obj && obj.config && obj.config['cz-ccgls'];

  // Start with `package.json`
  return readPkg()
    .then(({ pkg }) => {
      const config = getConfig(pkg);

      if (config) {
        return config;
      }

      // If no config, look after `.czrc`
      return new Promise(resolve => {
        fs.readFile(path.resolve(cwd, '.czrc'), 'utf8', (err, content) => {
          if (err) {
            resolve({});

            return;
          }

          const czrc = (content && JSON.parse(content)) || null;

          resolve(getConfig(czrc));
        });
      });
    })
    // Merge with defaults
    .then(config => ({
      ...defaultConfig,
      ...config,
    }))
    // Load Lerna scopes if configured
    .then(config => {
      if (!config.useScopes) {
        return config;
      }

      return Promise.resolve()
        .then(() => {
          const Project = importFrom(cwd, '@lerna/project');
          const project = new Project(cwd);

          return project.getPackages();
        })
        .then(packages => ({
          ...config,
          scopes: [
            ...config.scopes,
            ...packages
              .map(pkg => pkg.name)
              .map(name => name.charAt(0) === '@' ? name.split('/')[1] : name),
          ],
        }));
    })
    .catch(() => defaultConfig);
}

/**
 * Get types for prompt
 * name: <emoji-symbol> <type>: <description>
 * value: <type>
 * emoji: <emoji-code>
 *
 * @returns {array} list of types
 */
function getTypes() {
  // Needed for alignment wit rightPad
  const length = longest(Object.keys(types)).length + 2;

  return map(types, (type, key) => {
    const { code, symbol } = emojis[key];
    const { description } = type;

    return {
      name: `${rightPad(`${symbol} ${key}:`, length + symbol.length)} ${description}`,
      value: key,
      emoji: code,
    };
  });
}

/**
 * Fill prompt for questions
 * 1. Type
 * 2. Scope
 * 3. Subject (short)
 * 4. Issues
 * %. Body (long)
 *
 * @param {object} config from `loadConfig`
 * @return {array} list of questions
 */
function fillPrompt(config) {
  const choices = getTypes();

  return [
    {
      type: 'autocomplete',
      name: 'type',
      message: 'Select the type of change you\'re committing:',

      source: (answersSoFar, input) => {
        const query = input || '';

        return new Promise(resolve => {
          const result = fuzzy.filter(query, choices, {
            extract: el => el.name,
          });

          setTimeout(() => {
            resolve(result.map(el => el.original));
          }, 100);
        });
      },
    },
    {
      type: config.scopes ? 'list' : 'input',
      name: 'scope',
      message: 'Specify a scope:',
      choices: config.scopes && [
        {
          name: '[none]',
          value: '',
        },
        {
          name: 'root',
          value: 'root',
        },
      ].concat(config.scopes),
    },
    {
      type: 'input',
      name: 'subject',
      message: 'Write a short description:',
    },
    {
      type: 'input',
      name: 'issues',
      message: 'List any issue closed (#1, ...):',
    },
    {
      type: 'input',
      name: 'body',
      message: 'Provide a longer description:',
    },
  ];
}

/**
 * Format the git commit message from given answers.
 *
 * @param {object} answers from prompt
 * @return {string} formated git commit message
 */
function format(answers) {
  // Optional scope with parenthesis
  const scope = answers.scope ? `(${answers.scope.trim()})` : '';

  // Build head line, add emoji and limit to 100
  const head = truncate(`${answers.type}${scope}: ${emojis[answers.type].symbol} ${answers.subject.trim()}`, 100);
  const body = wrap(answers.body, 100);
  const footer = (answers.issues.match(/#\d+/g) || [])
    .map(issue => `Closes ${issue}`)
    .join('\n');

  return [head, body, footer]
    .join('\n\n')
    .trim();
}

/**
 * Export `prompter` method for `commitizen`.
 */
module.exports = {
  prompter(cz, commit) {
    cz.prompt.registerPrompt('autocomplete', autocomplete);
    loadConfig()
      .then(fillPrompt)
      .then(cz.prompt)
      .then(format)
      .then(commit);
  },
};
