import http from 'node:http'
import crypto from 'node:crypto'
import initSqlJs from 'sql.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

const port = Number(process.env.AUTH_API_PORT || 2166)
const host = process.env.AUTH_API_HOST || '127.0.0.1'
const dataDir = process.env.AUTH_DATA_DIR || join(__dirname, '..', 'data')
const dbPath = join(dataDir, 'auth.db')

const SESSION_HEADER_NAME = 'X-Playground-Session'
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000
const TOKEN_BYTES = 32
const DEFAULT_ADMIN_PASSWORD = process.env.AUTH_DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(18).toString('base64url')
const DEFAULT_SINGLE_API_SETTINGS = {
  baseUrl: 'https://code1.ciyuanapi.xyz/v1',
  apiKey: '',
  model: 'gpt-image-2',
  timeout: 600,
  apiMode: 'images',
  codexCli: false,
  apiProxy: false,
  customProviders: [],
  clearInputAfterSubmit: true,
  persistInputOnRestart: true,
  reuseTaskApiProfileTemporarily: false,
  alwaysShowRetryButton: false,
  enterSubmit: false,
  activeProfileId: 'gpt-single',
  profiles: [
    {
      id: 'gpt-single',
      name: 'GPT',
      provider: 'openai',
      baseUrl: 'https://code1.ciyuanapi.xyz/v1',
      apiKey: '',
      model: 'gpt-image-2',
      timeout: 600,
      apiMode: 'images',
      codexCli: false,
      apiProxy: false,
    },
  ],
}

let db = null

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex')
}

function generateToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex')
}

function saveDatabase() {
  const data = db.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
}

function initializeDatabase() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      remaining_generations INTEGER,
      successful_generations INTEGER NOT NULL DEFAULT 0,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS admin_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      task_data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      file_path TEXT NOT NULL,
      thumbnail_path TEXT,
      source TEXT,
      width INTEGER,
      height INTEGER,
      created_at INTEGER NOT NULL
    )
  `)

  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_username ON sessions(username)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_tasks_username ON tasks(username)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_images_username ON images(username)`)

  saveDatabase()
}

function ensureDefaultApiSettings() {
  const result = db.exec(`SELECT value FROM admin_settings WHERE key = 'api_settings'`)
  if (result.length > 0 && result[0].values.length > 0) return

  const now = Date.now()
  db.run(
    `INSERT INTO admin_settings (key, value, updated_at) VALUES (?, ?, ?)`,
    ['api_settings', JSON.stringify(DEFAULT_SINGLE_API_SETTINGS), now]
  )
  saveDatabase()
  console.log('[auth] Created default API settings')
}

function initializeDefaultAdmin() {
  const result = db.exec("SELECT username FROM users WHERE username = 'admin'")
  if (result.length === 0 || result[0].values.length === 0) {
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD, salt)
    const now = Date.now()
    db.run(
      `INSERT INTO users (username, password_hash, password_salt, role, remaining_generations, successful_generations, disabled, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', NULL, 0, 0, ?, ?)`,
      ['admin', passwordHash, salt, now, now]
    )
    saveDatabase()
    console.log(`[auth] Created default admin user: admin / ${DEFAULT_ADMIN_PASSWORD}`)
  }

  ensureDefaultApiSettings()
}

function cleanExpiredSessions() {
  const now = Date.now()
  db.run('DELETE FROM sessions WHERE expires_at < ?', [now])
  saveDatabase()
}

function appendCors(headers) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': `${SESSION_HEADER_NAME}, Content-Type`,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  }
}

function readStoredAdminSettings() {
  const result = db.exec(`SELECT value FROM admin_settings WHERE key = 'api_settings'`)
  if (result.length === 0 || result[0].values.length === 0) return null
  try {
    return JSON.parse(result[0].values[0][0])
  } catch {
    return null
  }
}

function normalizeSyncVersion(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function mergeAdminApiSettingsPreservingSecrets(existingSettings, incomingSettings) {
  if (!incomingSettings || typeof incomingSettings !== 'object') return incomingSettings
  if (!existingSettings || typeof existingSettings !== 'object') return incomingSettings

  const existingProfiles = Array.isArray(existingSettings.profiles) ? existingSettings.profiles : []
  const incomingProfiles = Array.isArray(incomingSettings.profiles) ? incomingSettings.profiles : []
  if (incomingProfiles.length === 0) return incomingSettings

  return {
    ...incomingSettings,
    profiles: incomingProfiles.map((profile) => {
      if (!profile || typeof profile !== 'object') return profile
      const existingProfile = existingProfiles.find((item) => item && item.id === profile.id)
      if (
        existingProfile &&
        typeof existingProfile.apiKey === 'string' &&
        existingProfile.apiKey.trim() &&
        (!profile.apiKey || (typeof profile.apiKey === 'string' && !profile.apiKey.trim()))
      ) {
        return { ...profile, apiKey: existingProfile.apiKey }
      }
      return profile
    }),
  }
}

function shouldReplaceStoredTask(existingTask, nextTask) {
  if (!existingTask || typeof existingTask !== 'object') return true
  const existingVersion = normalizeSyncVersion(existingTask.__syncVersion)
  const nextVersion = normalizeSyncVersion(nextTask?.__syncVersion)
  if (nextVersion !== existingVersion) return nextVersion > existingVersion

  const existingFinishedAt = typeof existingTask.finishedAt === 'number' ? existingTask.finishedAt : 0
  const nextFinishedAt = typeof nextTask?.finishedAt === 'number' ? nextTask.finishedAt : 0
  if (nextFinishedAt !== existingFinishedAt) return nextFinishedAt > existingFinishedAt

  const existingOutputCount = Array.isArray(existingTask.outputImages) ? existingTask.outputImages.length : 0
  const nextOutputCount = Array.isArray(nextTask?.outputImages) ? nextTask.outputImages.length : 0
  if (nextOutputCount !== existingOutputCount) return nextOutputCount > existingOutputCount

  return true
}

function send(res, status, headers, body) {
  res.writeHead(status, headers)
  res.end(body)
}

function sendJson(res, status, payload) {
  send(res, status, appendCors({ 'Content-Type': 'application/json; charset=utf-8' }), JSON.stringify(payload))
}

function sendError(res, status, message) {
  sendJson(res, status, { error: { message } })
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8')
      if (!text) {
        resolve({ text: '', json: null })
        return
      }
      try {
        resolve({ text, json: JSON.parse(text) })
      } catch {
        resolve({ text, json: null })
      }
    })
    req.on('error', () => resolve({ text: '', json: null }))
  })
}

function getSessionToken(req) {
  const header = req.headers[SESSION_HEADER_NAME.toLowerCase()]
  if (typeof header === 'string' && header.trim()) {
    return header.trim()
  }
  return null
}

function verifySession(token) {
  const now = Date.now()
  const result = db.exec(
    `SELECT s.username, u.role
     FROM sessions s
     JOIN users u ON s.username = u.username
     WHERE s.token = ? AND s.expires_at > ? AND u.disabled = 0`,
    [token, now]
  )

  if (result.length === 0 || result[0].values.length === 0) return null

  const row = result[0].values[0]
  return { username: row[0], role: row[1] }
}

function userRowToAuthUser(row) {
  return {
    username: row[0],
    role: row[1],
    remainingGenerations: row[2],
    successfulGenerations: row[3],
    disabled: row[4] === 1,
    createdAt: row[5],
    updatedAt: row[6],
  }
}

async function handleLogin(req, res) {
  const { json } = await readBody(req)
  if (!json || typeof json !== 'object') {
    sendError(res, 400, 'Invalid request body')
    return
  }

  const body = json
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!username || !password) {
    sendError(res, 400, 'Username and password are required')
    return
  }

  const result = db.exec(
    `SELECT username, password_hash, password_salt, role, remaining_generations, successful_generations, disabled, created_at, updated_at
     FROM users WHERE username = ?`,
    [username]
  )

  if (result.length === 0 || result[0].values.length === 0) {
    sendError(res, 401, 'Invalid username or password')
    return
  }

  const row = result[0].values[0]
  const usernameValue = row[0]
  const passwordHash = row[1]
  const passwordSalt = row[2]
  const role = row[3]
  const remainingGenerations = row[4]
  const successfulGenerations = row[5]
  const disabled = row[6]
  const createdAt = row[7]
  const updatedAt = row[8]

  if (disabled === 1) {
    sendError(res, 403, 'User account is disabled')
    return
  }

  const computedHash = hashPassword(password, passwordSalt)
  if (computedHash !== passwordHash) {
    sendError(res, 401, 'Invalid username or password')
    return
  }

  const token = generateToken()
  const now = Date.now()
  const expiresAt = now + SESSION_EXPIRY_MS

  db.run(
    `INSERT INTO sessions (token, username, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    [token, usernameValue, now, expiresAt]
  )
  saveDatabase()

  sendJson(res, 200, {
    token,
    user: {
      username: usernameValue,
      role: role,
      remainingGenerations: remainingGenerations,
      successfulGenerations: successfulGenerations,
      disabled: disabled === 1,
      createdAt: createdAt,
      updatedAt: updatedAt,
    },
  })
}

async function handleLogout(req, res) {
  const token = getSessionToken(req)
  if (token) {
    db.run('DELETE FROM sessions WHERE token = ?', [token])
    saveDatabase()
  }
  sendJson(res, 200, { success: true })
}

async function handleGetCurrentUser(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const result = db.exec(
    `SELECT username, role, remaining_generations, successful_generations, disabled, created_at, updated_at
     FROM users WHERE username = ?`,
    [session.username]
  )

  if (result.length === 0 || result[0].values.length === 0) {
    sendError(res, 404, 'User not found')
    return
  }

  sendJson(res, 200, { user: userRowToAuthUser(result[0].values[0]) })
}

async function handleGetUsers(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session || session.role !== 'admin') {
    sendError(res, 403, 'Admin access required')
    return
  }

  const result = db.exec(
    `SELECT username, role, remaining_generations, successful_generations, disabled, created_at, updated_at
     FROM users ORDER BY created_at ASC`
  )

  const users = result.length > 0 ? result[0].values.map(userRowToAuthUser) : []
  sendJson(res, 200, { users })
}

async function handleCreateUser(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session || session.role !== 'admin') {
    sendError(res, 403, 'Admin access required')
    return
  }

  const { json } = await readBody(req)
  if (!json || typeof json !== 'object') {
    sendError(res, 400, 'Invalid request body')
    return
  }

  const body = json
  const username = typeof body.username === 'string' ? body.username.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  const remainingGenerations = typeof body.remainingGenerations === 'number' ? body.remainingGenerations : 0

  if (!username || !password) {
    sendError(res, 400, 'Username and password are required')
    return
  }

  if (username.length < 2 || username.length > 50) {
    sendError(res, 400, 'Username must be between 2 and 50 characters')
    return
  }

  if (password.length < 6) {
    sendError(res, 400, 'Password must be at least 6 characters')
    return
  }

  const existing = db.exec('SELECT username FROM users WHERE username = ?', [username])
  if (existing.length > 0 && existing[0].values.length > 0) {
    sendError(res, 409, 'Username already exists')
    return
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, salt)
  const now = Date.now()

  db.run(
    `INSERT INTO users (username, password_hash, password_salt, role, remaining_generations, successful_generations, disabled, created_at, updated_at)
     VALUES (?, ?, ?, 'user', ?, 0, 0, ?, ?)`,
    [username, passwordHash, salt, remainingGenerations, now, now]
  )
  saveDatabase()

  const result = db.exec(
    `SELECT username, role, remaining_generations, successful_generations, disabled, created_at, updated_at
     FROM users WHERE username = ?`,
    [username]
  )

  sendJson(res, 201, { user: userRowToAuthUser(result[0].values[0]) })
}

async function handleUpdateUser(req, res, username) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session || session.role !== 'admin') {
    sendError(res, 403, 'Admin access required')
    return
  }

  const { json } = await readBody(req)
  if (!json || typeof json !== 'object') {
    sendError(res, 400, 'Invalid request body')
    return
  }

  const body = json
  const updates = []
  const values = []

  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 6) {
      sendError(res, 400, 'Password must be at least 6 characters')
      return
    }
    const salt = crypto.randomBytes(16).toString('hex')
    const passwordHash = hashPassword(body.password, salt)
    updates.push('password_hash = ?', 'password_salt = ?')
    values.push(passwordHash, salt)
  }

  if (typeof body.remainingGenerations === 'number') {
    updates.push('remaining_generations = ?')
    values.push(body.remainingGenerations)
  }

  if (typeof body.disabled === 'boolean') {
    updates.push('disabled = ?')
    values.push(body.disabled ? 1 : 0)
  }

  if (updates.length === 0) {
    sendError(res, 400, 'No valid update fields provided')
    return
  }

  updates.push('updated_at = ?')
  values.push(Date.now())
  values.push(username)

  db.run(`UPDATE users SET ${updates.join(', ')} WHERE username = ?`, values)
  saveDatabase()

  const result = db.exec(
    `SELECT username, role, remaining_generations, successful_generations, disabled, created_at, updated_at
     FROM users WHERE username = ?`,
    [username]
  )

  if (result.length === 0 || result[0].values.length === 0) {
    sendError(res, 404, 'User not found')
    return
  }

  sendJson(res, 200, { user: userRowToAuthUser(result[0].values[0]) })
}

async function handleDeleteUser(req, res, username) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session || session.role !== 'admin') {
    sendError(res, 403, 'Admin access required')
    return
  }

  if (username === 'admin') {
    sendError(res, 403, 'Cannot delete the default admin user')
    return
  }

  const result = db.run('DELETE FROM users WHERE username = ?', [username])
  saveDatabase()

  if (result.changes === 0) {
    sendError(res, 404, 'User not found')
    return
  }

  sendJson(res, 200, { success: true })
}

async function handleDecrementGenerations(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const result = db.exec(
    `SELECT username, role, remaining_generations, successful_generations, disabled, created_at, updated_at
     FROM users WHERE username = ?`,
    [session.username]
  )

  if (result.length === 0 || result[0].values.length === 0) {
    sendError(res, 404, 'User not found')
    return
  }

  const user = result[0].values[0]
  const role = user[1]
  const remainingGenerations = user[2]

  if (role !== 'admin' && remainingGenerations !== null) {
    if (remainingGenerations <= 0) {
      sendError(res, 403, 'No remaining generations')
      return
    }
    const now = Date.now()
    db.run(
      `UPDATE users
       SET remaining_generations = remaining_generations - 1,
           successful_generations = successful_generations + 1,
           updated_at = ?
       WHERE username = ?`,
      [now, session.username]
    )
  } else {
    const now = Date.now()
    db.run(
      `UPDATE users
       SET successful_generations = successful_generations + 1,
           updated_at = ?
       WHERE username = ?`,
      [now, session.username]
    )
  }
  saveDatabase()

  const updatedResult = db.exec(
    `SELECT username, role, remaining_generations, successful_generations, disabled, created_at, updated_at
     FROM users WHERE username = ?`,
    [session.username]
  )

  sendJson(res, 200, { user: userRowToAuthUser(updatedResult[0].values[0]) })
}

async function handleGetApiSettings(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const settings = readStoredAdminSettings()
  if (!settings) {
    sendJson(res, 200, { settings: null })
    return
  }
  sendJson(res, 200, { settings })
}

async function handleSetApiSettings(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session || session.role !== 'admin') {
    sendError(res, 403, 'Admin access required')
    return
  }

  sendError(res, 405, 'API settings are read-only. Update admin_settings.api_settings in the database directly.')
}

async function handleSaveTask(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const { json } = await readBody(req)
  if (!json || typeof json !== 'object') {
    sendError(res, 400, 'Invalid request body')
    return
  }

  const taskId = json.id
  if (!taskId || typeof taskId !== 'string') {
    sendError(res, 400, 'Task ID is required')
    return
  }

  const existingResult = db.exec(
    `SELECT task_data FROM tasks WHERE id = ? AND username = ?`,
    [taskId, session.username]
  )
  if (existingResult.length > 0 && existingResult[0].values.length > 0) {
    try {
      const existingTask = JSON.parse(existingResult[0].values[0][0])
      if (!shouldReplaceStoredTask(existingTask, json)) {
        sendJson(res, 200, { success: true, id: taskId, skipped: true })
        return
      }
    } catch (error) {
      console.error('Failed to parse existing task data:', error)
    }
  }

  const now = Date.now()
  const taskData = JSON.stringify(json)

  db.run(
    `INSERT OR REPLACE INTO tasks (id, username, task_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [taskId, session.username, taskData, now, now]
  )
  saveDatabase()

  sendJson(res, 200, { success: true, id: taskId })
}

async function handleGetTasks(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const result = db.exec(
    `SELECT task_data FROM tasks WHERE username = ? ORDER BY created_at DESC`,
    [session.username]
  )

  const tasks = []
  if (result.length > 0) {
    for (const row of result[0].values) {
      try {
        tasks.push(JSON.parse(row[0]))
      } catch (e) {
        console.error('Failed to parse task data:', e)
      }
    }
  }

  sendJson(res, 200, { tasks })
}

async function handleDeleteTask(req, res, taskId) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const result = db.run(
    `DELETE FROM tasks WHERE id = ? AND username = ?`,
    [taskId, session.username]
  )
  saveDatabase()

  if (result.changes === 0) {
    sendError(res, 404, 'Task not found')
    return
  }

  sendJson(res, 200, { success: true })
}

async function handleSaveImage(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const { json } = await readBody(req)
  if (!json || typeof json !== 'object') {
    sendError(res, 400, 'Invalid request body')
    return
  }

  const imageId = json.id
  const dataUrl = json.dataUrl
  const thumbnailDataUrl = json.thumbnailDataUrl

  if (!imageId || typeof imageId !== 'string') {
    sendError(res, 400, 'Image ID is required')
    return
  }

  if (!dataUrl || typeof dataUrl !== 'string') {
    sendError(res, 400, 'Image data is required')
    return
  }

  const imagesDir = join(dataDir, 'images')
  if (!existsSync(imagesDir)) {
    mkdirSync(imagesDir, { recursive: true })
  }

  const userImagesDir = join(imagesDir, session.username)
  if (!existsSync(userImagesDir)) {
    mkdirSync(userImagesDir, { recursive: true })
  }

  const now = Date.now()
  const imageFileName = `${imageId}.txt`
  const thumbnailFileName = `${imageId}_thumb.txt`
  const imageFilePath = join(userImagesDir, imageFileName)
  const thumbnailFilePath = join(userImagesDir, thumbnailFileName)

  writeFileSync(imageFilePath, dataUrl, 'utf8')
  
  if (thumbnailDataUrl) {
    writeFileSync(thumbnailFilePath, thumbnailDataUrl, 'utf8')
  }

  db.run(
    `INSERT OR REPLACE INTO images (id, username, file_path, thumbnail_path, source, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [imageId, session.username, imageFilePath, thumbnailDataUrl ? thumbnailFilePath : null, json.source || null, json.width || null, json.height || null, now]
  )
  saveDatabase()

  sendJson(res, 200, { success: true, id: imageId })
}

async function handleGetImages(req, res) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const result = db.exec(
    `SELECT id, file_path, thumbnail_path, source, width, height, created_at FROM images WHERE username = ? ORDER BY created_at DESC`,
    [session.username]
  )

  const images = []
  if (result.length > 0) {
    for (const row of result[0].values) {
      const imagePath = row[1]
      const thumbnailPath = row[2]
      
      let dataUrl = null
      let thumbnailDataUrl = null

      if (existsSync(imagePath)) {
        dataUrl = readFileSync(imagePath, 'utf8')
      }

      if (thumbnailPath && existsSync(thumbnailPath)) {
        thumbnailDataUrl = readFileSync(thumbnailPath, 'utf8')
      }

      images.push({
        id: row[0],
        dataUrl,
        thumbnailDataUrl,
        source: row[3],
        width: row[4],
        height: row[5],
        createdAt: row[6]
      })
    }
  }

  sendJson(res, 200, { images })
}

async function handleGetImage(req, res, imageId) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const result = db.exec(
    `SELECT file_path, thumbnail_path, source, width, height, created_at FROM images WHERE id = ? AND username = ?`,
    [imageId, session.username]
  )

  if (result.length === 0 || result[0].values.length === 0) {
    sendError(res, 404, 'Image not found')
    return
  }

  const row = result[0].values[0]
  const imagePath = row[0]
  const thumbnailPath = row[1]

  let dataUrl = null
  let thumbnailDataUrl = null

  if (existsSync(imagePath)) {
    dataUrl = readFileSync(imagePath, 'utf8')
  }

  if (thumbnailPath && existsSync(thumbnailPath)) {
    thumbnailDataUrl = readFileSync(thumbnailPath, 'utf8')
  }

  sendJson(res, 200, {
    image: {
      id: imageId,
      dataUrl,
      thumbnailDataUrl,
      source: row[2],
      width: row[3],
      height: row[4],
      createdAt: row[5]
    }
  })
}

async function handleDeleteImage(req, res, imageId) {
  const token = getSessionToken(req)
  if (!token) {
    sendError(res, 401, 'Missing session token')
    return
  }

  const session = verifySession(token)
  if (!session) {
    sendError(res, 401, 'Invalid or expired session')
    return
  }

  const result = db.exec(
    `SELECT file_path, thumbnail_path FROM images WHERE id = ? AND username = ?`,
    [imageId, session.username]
  )

  if (result.length === 0 || result[0].values.length === 0) {
    sendError(res, 404, 'Image not found')
    return
  }

  const row = result[0].values[0]
  const imagePath = row[0]
  const thumbnailPath = row[1]

  if (existsSync(imagePath)) {
    const fs = require('fs')
    fs.unlinkSync(imagePath)
  }

  if (thumbnailPath && existsSync(thumbnailPath)) {
    const fs = require('fs')
    fs.unlinkSync(thumbnailPath)
  }

  db.run(
    `DELETE FROM images WHERE id = ? AND username = ?`,
    [imageId, session.username]
  )
  saveDatabase()

  sendJson(res, 200, { success: true })
}

async function main() {
  const SQL = await initSqlJs()

  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  initializeDatabase()
  initializeDefaultAdmin()

  setInterval(cleanExpiredSessions, 60 * 60 * 1000)

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`)

    if (req.method === 'OPTIONS') {
      send(res, 204, appendCors({}), '')
      return
    }

    try {
      if (req.method === 'POST' && url.pathname === '/api/auth/login') {
        await handleLogin(req, res)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
        await handleLogout(req, res)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/auth/me') {
        await handleGetCurrentUser(req, res)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/auth/decrement') {
        await handleDecrementGenerations(req, res)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/admin/settings/api') {
        await handleGetApiSettings(req, res)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/admin/settings/api') {
        await handleSetApiSettings(req, res)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/admin/users') {
        await handleGetUsers(req, res)
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/admin/users') {
        await handleCreateUser(req, res)
        return
      }

      const updateUserMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/)
      if (updateUserMatch) {
        const username = decodeURIComponent(updateUserMatch[1])
        if (req.method === 'PATCH') {
          await handleUpdateUser(req, res, username)
          return
        }
        if (req.method === 'DELETE') {
          await handleDeleteUser(req, res, username)
          return
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/tasks') {
        await handleSaveTask(req, res)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/tasks') {
        await handleGetTasks(req, res)
        return
      }

      const deleteTaskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/)
      if (deleteTaskMatch) {
        const taskId = decodeURIComponent(deleteTaskMatch[1])
        if (req.method === 'DELETE') {
          await handleDeleteTask(req, res, taskId)
          return
        }
      }

      if (req.method === 'POST' && url.pathname === '/api/images') {
        await handleSaveImage(req, res)
        return
      }

      if (req.method === 'GET' && url.pathname === '/api/images') {
        await handleGetImages(req, res)
        return
      }

      const imageMatch = url.pathname.match(/^\/api\/images\/([^/]+)$/)
      if (imageMatch) {
        const imageId = decodeURIComponent(imageMatch[1])
        if (req.method === 'GET') {
          await handleGetImage(req, res, imageId)
          return
        }
        if (req.method === 'DELETE') {
          await handleDeleteImage(req, res, imageId)
          return
        }
      }

      sendError(res, 404, 'Not found')
    } catch (error) {
      console.error('[auth] Error:', error)
      sendError(res, 500, 'Internal server error')
    }
  })

  server.listen(port, host, () => {
    console.log(`[auth] Authentication API running at http://${host}:${port}`)
    console.log(`[auth] Database: ${dbPath}`)
  })
}

main()
