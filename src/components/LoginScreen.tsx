import { useState } from 'react'
import { useStore } from '../store'

export default function LoginScreen() {
  const login = useStore((s) => s.login)
  const authLoading = useStore((s) => s.authLoading)
  const authError = useStore((s) => s.authError)

  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('z199512j')
  const [localError, setLocalError] = useState<string | null>(null)

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      setLocalError('请输入用户名和密码。')
      return
    }

    setLocalError(null)
    try {
      await login(username.trim(), password)
    } catch {
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_36%),linear-gradient(180deg,_#f7fafc_0%,_#eef2f7_100%)] px-4 py-10 text-gray-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/70 bg-white/90 shadow-[0_30px_90px_rgba(15,23,42,0.16)] backdrop-blur">
          <section className="p-6 sm:p-10">
            <div className="mx-auto max-w-md">
              <form className="space-y-5" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-600">用户名</span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                    autoComplete="username"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-600">密码</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none transition focus:border-blue-300 focus:bg-white"
                    autoComplete="current-password"
                  />
                </label>

                {(localError || authError) && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {localError || authError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authLoading ? '登录中...' : '登录'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
