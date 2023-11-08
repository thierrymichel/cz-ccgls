import { execSync } from 'child_process'
import fetch from 'node-fetch'

function getApiInfos() {
  const { GITLAB_API_PRIVATE_TOKEN: token, GITLAB_API_ENDPOINT: api } =
    process.env

  if (!token) {
    throw new Error('Gitlab TOKEN is not defined')
  }

  if (!api) {
    throw new Error('Gitlab API is not defined')
  }

  return { token, api }
}

function getProjectPath() {
  const projectRemote = execSync('git remote get-url origin').toString()
  const projectPath = encodeURIComponent(
    projectRemote.trim().replace(/^git@git\.epic\.net:(.*)\.git+$/, '$1')
  )

  return projectPath
}

async function fetchIssues(url, config, page = 1, issues = []) {
  try {
    const perPage = 100
    const res = await fetch(
      `${url}?state=opened&per_page=${perPage}&page=${page}`,
      config
    )

    if (!res.ok) {
      console.error(
        `Error fetching issues [${url}]`,
        res.status,
        res.statusText
      )

      return []
    }

    const data = await res.json()
    const formattedIssues = issues.concat(
      data.map(issue => ({
        name: `#${issue.iid} - ${issue.title}`,
        value: issue.iid,
      }))
    )

    const nextPage = Number(res.headers.get('x-next-page'))

    if (nextPage > 0) {
      return fetchIssues(url, config, nextPage, formattedIssues)
    }

    return formattedIssues
  } catch (error) {
    console.error(error.message)

    return []
  }
}

async function getIssues() {
  try {
    const { api, token } = getApiInfos()
    const projectPath = getProjectPath()
    const url = `${api}/projects/${projectPath}/issues`
    const config = {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    }

    const issues = await fetchIssues(url, config)

    return issues
  } catch (error) {
    console.error(error.message)

    return []
  }
}

export { getIssues }
