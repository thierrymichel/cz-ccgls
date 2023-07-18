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

async function getIssues() {
  try {
    // ? manage pagination?
    const page = 1
    const { api, token } = getApiInfos()
    const projectPath = getProjectPath()
    const url = `${api}/projects/${projectPath}/issues`
    const res = await fetch(`${url}?state=opened&per_page=5&page=${page}`, {
      headers: {
        'PRIVATE-TOKEN': token,
      },
    })

    if (!res.ok) {
      console.error(
        `Error fetching issues [${url}]`,
        res.status,
        res.statusText
      )

      return []
    }

    const data = await res.json()
    const issues = data.map(issue => ({
      name: `#${issue.iid} - ${issue.title}`,
      value: issue.iid,
    }))

    return issues
  } catch (error) {
    console.error(error.message)

    return []
  }
}

export { getIssues }
