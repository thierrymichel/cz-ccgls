import fs from 'fs'
import path from 'path'

import fetch from 'node-fetch'
import findCacheDir from 'find-cache-dir'
import { pathExistsSync } from 'path-exists'
import ora from 'ora'

const GITMOJI_CACHE = {
  DIR: findCacheDir({ name: 'ccgls' }),
  FILE: 'gitmojis.json',
  TTL: 2592000000, // 30 days
}

const filename = path.join(GITMOJI_CACHE.DIR, GITMOJI_CACHE.FILE)
const cache = {
  ok() {
    if (pathExistsSync(filename)) {
      const { mtime } = fs.statSync(filename)

      return mtime.getMilliseconds() + GITMOJI_CACHE.TTL < Date.now()
    }

    return false
  },
  get() {
    return Promise.resolve(JSON.parse(fs.readFileSync(filename)))
  },
  set(emojis) {
    if (!pathExistsSync(path.dirname(filename))) {
      fs.mkdirSync(path.dirname(filename), { recursive: true })
    }

    fs.writeFileSync(filename, JSON.stringify(emojis))
  },
}

const GITMOJIS_URL =
  'https://raw.githubusercontent.com/carloscuesta/gitmoji/master/src/data/gitmojis.json'

function getEmojis() {
  if (cache.ok()) {
    return cache.get()
  }

  const spinner = ora('Fetching the emoji list').start()

  return fetch(GITMOJIS_URL)
    .then(response => response.json())
    .then(data => {
      const emojis = data.gitmojis

      cache.set(emojis)
      spinner.succeed('Gitmojis fetched successfully')

      return emojis
    })
    .catch(error => {
      spinner.fail(`Error: ${error}`)
    })
}

export { getEmojis }

export function sum(a, b) {
  return a + b
}
