const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { shell } = require('electron')

const SESSION_FILE = 'DAO-session.json'
const OAUTH_TIMEOUT_MS = 120_000

function sessionFilePath(app) {
  return path.join(app.getPath('userData'), SESSION_FILE)
}

function encryptToken(safeStorage, encryptDesktopSecret, token) {
  if (!token) {
    return null
  }
  try {
    return encryptDesktopSecret(token, safeStorage)
  } catch {
    return { encoding: 'plain', value: token }
  }
}

function decryptToken(decryptDesktopSecret, secret) {
  if (!secret || typeof secret !== 'object') {
    return ''
  }
  return decryptDesktopSecret(secret)
}

function readStoredToken(app, decryptDesktopSecret) {
  const filePath = sessionFilePath(app)
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return decryptToken(decryptDesktopSecret, parsed.token) || null
  } catch {
    return null
  }
}

function writeStoredToken(app, safeStorage, encryptDesktopSecret, decryptDesktopSecret, token) {
  const filePath = sessionFilePath(app)
  if (!token) {
    clearStoredToken(app)
    return null
  }
  const payload = {
    token: encryptToken(safeStorage, encryptDesktopSecret, token),
    updatedAt: Date.now()
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(payload), 'utf8')
  return decryptToken(decryptDesktopSecret, payload.token)
}

function clearStoredToken(app) {
  try {
    fs.unlinkSync(sessionFilePath(app))
  } catch {
    /* absent */
  }
}

async function startDAOOAuthLogin({ apiBase, provider }) {
  let resolveCode
  let rejectCode
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    if (url.pathname !== '/callback') {
      res.writeHead(404)
      res.end()
      return
    }
    const exchangeCode = url.searchParams.get('exchange_code')
    if (!exchangeCode) {
      res.writeHead(400, { 'Content-Type': 'text/plain' })
      res.end('Missing exchange_code')
      rejectCode(new Error('OAuth callback missing exchange_code'))
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      '<!doctype html><html><body><p>Login complete. You can close this window and return to DAO.</p></body></html>'
    )
    resolveCode(exchangeCode)
  })

  await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const base = String(apiBase || '').replace(/\/$/, '')
  const loginUrl = `${base}/api/v1/auth/login?${new URLSearchParams({
    provider,
    mode: 'desktop',
    redirect_uri: redirectUri
  })}`

  const timer = setTimeout(() => {
    rejectCode(new Error('OAuth login timed out'))
  }, OAUTH_TIMEOUT_MS)

  try {
    await shell.openExternal(loginUrl)
    const exchangeCode = await codePromise
    return exchangeOAuthCode(base, exchangeCode)
  } finally {
    clearTimeout(timer)
    server.close()
  }
}

async function exchangeOAuthCode(apiBase, exchangeCode) {
  const base = String(apiBase || '').replace(/\/$/, '')
  const res = await fetch(`${base}/api/v1/auth/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exchange_code: exchangeCode })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(text || `OAuth exchange failed (${res.status})`)
  }
  return res.json()
}

function registerDAOAuthIpc({
  app,
  ipcMain,
  safeStorage,
  encryptDesktopSecret,
  decryptDesktopSecret
}) {
  ipcMain.handle('hermes:DAO-auth:get-token', async () => ({
    token: readStoredToken(app, decryptDesktopSecret)
  }))

  ipcMain.handle('hermes:DAO-auth:set-token', async (_event, token) => {
    const saved = writeStoredToken(
      app,
      safeStorage,
      encryptDesktopSecret,
      decryptDesktopSecret,
      String(token || '')
    )
    return { ok: Boolean(saved) }
  })

  ipcMain.handle('hermes:DAO-auth:clear-token', async () => {
    clearStoredToken(app)
    return { ok: true }
  })

  ipcMain.handle('hermes:DAO-auth:oauth-login', async (_event, payload) => {
    const provider = String(payload?.provider || '').trim()
    const apiBase = String(payload?.apiBase || '').trim()
    if (!provider || !apiBase) {
      throw new Error('provider and apiBase are required')
    }
    const user = await startDAOOAuthLogin({ apiBase, provider })
    if (!user?.token) {
      throw new Error('OAuth login did not return a token')
    }
    writeStoredToken(app, safeStorage, encryptDesktopSecret, decryptDesktopSecret, user.token)
    return { ok: true, id: user.id, email: user.email, token: user.token }
  })
}

module.exports = {
  clearStoredToken,
  readStoredToken,
  registerDAOAuthIpc,
  startDAOOAuthLogin,
  writeStoredToken
}
