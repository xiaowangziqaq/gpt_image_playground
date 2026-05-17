import { useState } from 'react'
import loginBackground from '../../upload/背景图.png'
import wechatQrCode from '../../upload/微信二维码.png'
import { useStore } from '../store'

export default function LoginScreen() {
  const login = useStore((s) => s.login)
  const authLoading = useStore((s) => s.authLoading)
  const authError = useStore((s) => s.authError)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [showQrCode, setShowQrCode] = useState(false)

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
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-10 text-gray-900">
      <div
        aria-hidden="true"
        className="absolute inset-0 scale-[1.02] bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${loginBackground})` }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,23,42,0.72),rgba(15,23,42,0.4)_38%,rgba(248,250,252,0.12)_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_28%),radial-gradient(circle_at_left,rgba(59,130,246,0.22),transparent_32%)]"
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <div className="w-full max-w-md overflow-hidden rounded-[32px] border border-white/20 bg-white/14 shadow-[0_30px_90px_rgba(15,23,42,0.38)] backdrop-blur-xl">
          <section className="p-6 sm:p-10">
            <div className="mx-auto max-w-md">
              <form className="space-y-5" onSubmit={handleSubmit}>
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white/88">用户名</span>
                  <input
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    className="w-full rounded-2xl border border-white/20 bg-white/88 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white"
                    autoComplete="username"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-white/88">密码</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full rounded-2xl border border-white/20 bg-white/88 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 focus:bg-white"
                    autoComplete="current-password"
                  />
                </label>

                {(localError || authError) && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                    {localError || authError}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowQrCode(true)}
                    className="flex-1 rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                  >
                    注册
                  </button>
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="flex-1 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {authLoading ? '登录中...' : '登录'}
                  </button>
                </div>
              </form>

              <p className="mt-4 text-center text-xs text-white/60">
                注册需扫码添加管理员微信，由管理员创建账号
              </p>
            </div>
          </section>
        </div>
      </div>

      {showQrCode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowQrCode(false)}
        >
          <div
            className="relative max-w-sm overflow-hidden rounded-3xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowQrCode(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 className="mb-4 text-center text-lg font-semibold text-slate-900">
              扫码添加管理员微信
            </h3>
            <img
              src={wechatQrCode}
              alt="微信二维码"
              className="mx-auto max-h-80 w-auto"
            />
            <p className="mt-4 text-center text-sm text-slate-500">
              添加后由管理员为您创建账号
            </p>
          </div>
        </div>
      )}
    </main>
  )
}
