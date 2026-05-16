import type { AuthUser, LoginResponse } from '../types'
import { readRuntimeEnv } from './runtimeEnv'

export const SESSION_HEADER_NAME = 'X-Playground-Session'

const DEFAULT_LOCAL_AUTH_ORIGIN = 'http://127.0.0.1:2166'
const AUTH_API_ORIGIN = readRuntimeEnv(import.meta.env.VITE_AUTH_API_ORIGIN)

function getRouterOrigin() {
  if (AUTH_API_ORIGIN) {
    return AUTH_API_ORIGIN.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return DEFAULT_LOCAL_AUTH_ORIGIN
}

export function getAuthApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getRouterOrigin()}${normalizedPath}`
}

export function createSessionHeaders(token: string | null | undefined): Record<string, string> {
  if (!token) return {}
  return {
    [SESSION_HEADER_NAME]: token,
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload && typeof (payload as { error?: { message?: unknown } }).error?.message === 'string'
        ? String((payload as { error: { message: string } }).error.message)
        : `HTTP ${response.status}`
    throw new Error(message)
  }
  return payload as T
}

export async function loginWithPassword(username: string, password: string): Promise<LoginResponse> {
  const response = await fetch(getAuthApiUrl('/api/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  })
  return parseJsonResponse<LoginResponse>(response)
}

export async function logoutSession(token: string | null | undefined): Promise<void> {
  await fetch(getAuthApiUrl('/api/auth/logout'), {
    method: 'POST',
    headers: createSessionHeaders(token),
  }).catch(() => {})
}

export async function fetchCurrentUser(token: string): Promise<AuthUser> {
  const response = await fetch(getAuthApiUrl('/api/auth/me'), {
    headers: createSessionHeaders(token),
  })
  const payload = await parseJsonResponse<{ user: AuthUser }>(response)
  return payload.user
}

export async function fetchUsers(token: string): Promise<AuthUser[]> {
  const response = await fetch(getAuthApiUrl('/api/admin/users'), {
    headers: createSessionHeaders(token),
  })
  const payload = await parseJsonResponse<{ users: AuthUser[] }>(response)
  return payload.users
}

export async function createUser(
  token: string,
  payload: { username: string; password: string; remainingGenerations: number },
): Promise<AuthUser> {
  const response = await fetch(getAuthApiUrl('/api/admin/users'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createSessionHeaders(token),
    },
    body: JSON.stringify(payload),
  })
  const result = await parseJsonResponse<{ user: AuthUser }>(response)
  return result.user
}

export async function updateUser(
  token: string,
  username: string,
  payload: { password?: string; remainingGenerations?: number; disabled?: boolean },
): Promise<AuthUser> {
  const response = await fetch(getAuthApiUrl(`/api/admin/users/${encodeURIComponent(username)}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...createSessionHeaders(token),
    },
    body: JSON.stringify(payload),
  })
  const result = await parseJsonResponse<{ user: AuthUser }>(response)
  return result.user
}

export async function deleteUser(token: string, username: string): Promise<void> {
  const response = await fetch(getAuthApiUrl(`/api/admin/users/${encodeURIComponent(username)}`), {
    method: 'DELETE',
    headers: createSessionHeaders(token),
  })
  await parseJsonResponse<{ success: boolean }>(response)
}

export async function getApiSettings(token: string): Promise<unknown | null> {
  const response = await fetch(getAuthApiUrl('/api/admin/settings/api'), {
    headers: createSessionHeaders(token),
  })
  const result = await parseJsonResponse<{ settings: unknown | null }>(response)
  return result.settings
}

export async function setApiSettings(token: string, settings: unknown): Promise<void> {
  const response = await fetch(getAuthApiUrl('/api/admin/settings/api'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createSessionHeaders(token),
    },
    body: JSON.stringify(settings),
  })
  await parseJsonResponse<{ success: boolean }>(response)
}

export async function decrementGenerations(token: string): Promise<AuthUser> {
  const response = await fetch(getAuthApiUrl('/api/auth/decrement'), {
    method: 'POST',
    headers: createSessionHeaders(token),
  })
  const result = await parseJsonResponse<{ user: AuthUser }>(response)
  return result.user
}

export async function saveTask(token: string, task: unknown): Promise<void> {
  const response = await fetch(getAuthApiUrl('/api/tasks'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createSessionHeaders(token),
    },
    body: JSON.stringify(task),
  })
  await parseJsonResponse<{ success: boolean }>(response)
}

export async function getTasks(token: string): Promise<unknown[]> {
  const response = await fetch(getAuthApiUrl('/api/tasks'), {
    headers: createSessionHeaders(token),
  })
  const result = await parseJsonResponse<{ tasks: unknown[] }>(response)
  return result.tasks
}

export async function deleteTask(token: string, taskId: string): Promise<void> {
  const response = await fetch(getAuthApiUrl(`/api/tasks/${encodeURIComponent(taskId)}`), {
    method: 'DELETE',
    headers: createSessionHeaders(token),
  })
  await parseJsonResponse<{ success: boolean }>(response)
}

export async function saveImage(token: string, image: { id: string; dataUrl: string; thumbnailDataUrl?: string; source?: string; width?: number; height?: number }): Promise<void> {
  const response = await fetch(getAuthApiUrl('/api/images'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...createSessionHeaders(token),
    },
    body: JSON.stringify(image),
  })
  await parseJsonResponse<{ success: boolean }>(response)
}

export async function getImages(token: string): Promise<unknown[]> {
  const response = await fetch(getAuthApiUrl('/api/images'), {
    headers: createSessionHeaders(token),
  })
  const result = await parseJsonResponse<{ images: unknown[] }>(response)
  return result.images
}

export async function getImage(token: string, imageId: string): Promise<unknown | null> {
  const response = await fetch(getAuthApiUrl(`/api/images/${encodeURIComponent(imageId)}`), {
    headers: createSessionHeaders(token),
  })
  const result = await parseJsonResponse<{ image: unknown | null }>(response)
  return result.image
}

export async function deleteImage(token: string, imageId: string): Promise<void> {
  const response = await fetch(getAuthApiUrl(`/api/images/${encodeURIComponent(imageId)}`), {
    method: 'DELETE',
    headers: createSessionHeaders(token),
  })
  await parseJsonResponse<{ success: boolean }>(response)
}
