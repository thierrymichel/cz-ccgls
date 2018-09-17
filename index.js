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

const { types: conventionalTypes } = require('conventional-commit-types');
const gitmojis = require('./gitmojis');

const cwd = process.cwd();
const defaultConfig = {
  additionalTypes: {
    imp: {
      description: 'Improves a current implementation without adding a new feature or fixing a bug',
      title: 'Improvement',
    },
  },
  useEmojis: true,
  additionalEmojis: [],
  useScopes: true,
  additionalScopes: [],
  // You can use yours
  // types: {},
  // emojis: [],
  // scopes: [],
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
    .catch(() => defaultConfig);
}

// eslint-disable-next-line require-jsdoc
async function loadOptions(config) {
  const options = {};

  // Types
  let types = config.types || conventionalTypes;

  if (config.additionalTypes) {
    types = {
      ...types,
      ...config.additionalTypes,
    };
  }

  options.types = formatTypes(types);

  // Additional types
  // if (config.additionalTypes) {
  //   options.types = {
  //     ...options.types,
  //     ...config.additionalTypes,
  //   };
  // }

  // Gitmoji
  if (config.useEmojis) {
    let emojis = config.emojis || gitmojis;

    if (config.additionalEmojis) {
      emojis = [
        ...emojis,
        ...config.additionalEmojis,
      ];
    }

    options.emojis = formatEmojis(emojis);
  }

  // Load Lerna scopes if configured
  if (config.useScopes) {
    if (config.scopes) {
      options.scopes = config.scopes;
    } else {
      const Project = importFrom(cwd, '@lerna/project');
      const project = new Project(cwd);
      const packages = await project.getPackages();

      options.scopes = packages
        .map(pkg => pkg.name)
        .map(name => name.charAt(0) === '@' ? name.split('/')[1] : name);
    }

    options.scopes = [
      ...options.scopes,
      ...config.additionalScopes,
    ];
  }

  return options;
}

/**
 * Fill prompt for questions
 * 1. Type
 * 2. Scope
 * 3. Gitmoji
 * 4. Subject (short)
 * 5. Issues
 * 6. Body (long)
 *
 * @param {object} options from `loadOptions`
 * @return {array} list of questions
 */
function fillPrompt(options) {
  const { types, scopes, emojis } = options;
  const prompts = [
    {
      type: 'autocomplete',
      name: 'type',
      message: 'Select the type of change you\'re committing:',

      source: (answersSoFar, input) => {
        const query = input || '';

        return new Promise(resolve => {
          const result = fuzzy.filter(query, types, {
            extract: el => el.name,
          });

          setTimeout(() => {
            resolve(result.map(el => el.original));
          }, 100);
        });
      },
    },
    {
      type: scopes ? 'list' : 'input',
      name: 'scope',
      message: 'Specify a scope:',
      choices: scopes && [
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

  if (emojis) {
    prompts.splice(2, 0, {
      type: 'autocomplete',
      name: 'emoji',
      message: 'Choose an emoji:',
      source: (answersSoFar, input) => {
        const query = input || '';

        return new Promise(resolve => {
          const result = fuzzy.filter(query, emojis, {
            extract: el => el.name,
          });

          setTimeout(() => {
            resolve(result.map(el => el.original));
          }, 100);
        });
      },
    });
  }

  return prompts;
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
  // Optional subject with emoji
  const subject = answers.emoji ? `${answers.emoji} ${answers.subject}` : '';

  // Build head line, add emoji and limit to 100
  const head = truncate(`${answers.type}${scope}: ${subject.trim()}`, 100);
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
      .then(loadOptions)
      .then(fillPrompt)
      .then(cz.prompt)
      .then(format)
      .then(commit);
  },
};

/**
 * Get types for prompt
 * name: <type>: <description>
 * value: <type>
 * @param {object} types types to format
 * @returns {array} list of formatted types
 */
function formatTypes(types) {
  // Needed for alignment wit rightPad
  const length = longest(Object.keys(types)).length + 2;

  return map(types, (item, key) => {
    const { description } = item;

    return {
      name: `${rightPad(`${key}:`, length)} ${description}`,
      value: key,
    };
  });
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
    const { emoji, code, description } = item;

    return {
      name: `${emoji}: ${description}`,
      value: code,
    };
  });
}
