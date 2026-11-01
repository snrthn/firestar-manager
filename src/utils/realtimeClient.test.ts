import { describe, it, expect, vi, beforeEach } from 'vitest'

// 验证 SSE 实时客户端：① 代际守卫（同 token 不重建连接，避免每次路由切换断流重连）；
// ② 僵尸连接判定（旧 SSE 绑 OLD token，期间新登录改 NEW，401/顶号时静默断流，不弹窗误踢）。
const expiredMock = vi.fn()
vi.mock('@/api/sessionGuard', () => ({
  handleSessionExpired: expiredMock,
  hangSilently: vi.fn(),
}))
const dispatchMock = vi.fn()
vi.mock('./realtimeDispatch', () => ({ dispatchRealtime: dispatchMock }))

import { startRealtime, stopRealtime } from './realtimeClient'

// 统一控制 fetch：pending 模式便于构造「请求发出后、响应回来前 localStorage 已变」的僵尸时序
let pendingResolver: ((r: any) => void) | null = null
function fetchFactory(status: number, body: Record<string, unknown> = {}) {
  return vi.fn(
    () =>
      new Promise((res) => {
        pendingResolver = res
        // 非 pending 场景：立即 resolve
        if (status !== 0) {
          res({
            status,
            ok: status >= 200 && status < 300,
            body: status === 200 ? {} : undefined,
            json: async () => body,
            headers: { get: () => (status === 200 ? 'text/event-stream' : '') },
          })
        }
      }),
  )
}

const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  localStorage.clear()
  expiredMock.mockClear()
  dispatchMock.mockClear()
  pendingResolver = null
  vi.stubGlobal('fetch', fetchFactory(200))
})

describe('realtimeClient · 代际守卫 + 僵尸判定（P0）', () => {
  it('首次 start：发起 SSE 且携带当前 token', () => {
    localStorage.setItem('token', 'T1')
    startRealtime()
    const fetchFn = (globalThis as any).fetch
    expect(fetchFn).toHaveBeenCalled()
    const headers = fetchFn.mock.calls[0][1].headers
    expect(headers.Authorization).toBe('Bearer T1')
  })

  it('同 token 已在运行时再次 start：不重建连接', () => {
    localStorage.setItem('token', 'T1')
    startRealtime()
    const calls1 = (globalThis as any).fetch.mock.calls.length
    startRealtime() // 同 token
    const calls2 = (globalThis as any).fetch.mock.calls.length
    expect(calls2).toBe(calls1)
  })

  it('401 握手且 token 一致（非僵尸）：触发会话失效弹窗', async () => {
    localStorage.setItem('token', 'T1')
    vi.stubGlobal('fetch', fetchFactory(401, { message: 'kicked' }))
    startRealtime()
    await flush()
    expect(expiredMock).toHaveBeenCalledWith('kicked', 'T1')
  })

  it('401 握手僵尸：旧连接绑 OLD，期间新登录改 NEW → 静默 stopRealtime，不弹窗', async () => {
    localStorage.setItem('token', 'OLD')
    vi.stubGlobal('fetch', fetchFactory(0)) // pending，不立即 resolve
    startRealtime()
    localStorage.setItem('token', 'NEW') // 模拟新登录顶号
    expect(pendingResolver).toBeTruthy()
    pendingResolver!({ status: 401, json: async () => ({ message: 'x' }), headers: { get: () => '' } })
    await flush()
    expect(expiredMock).not.toHaveBeenCalled() // 僵尸：静默忽略，不弹窗
  })

  it('stopRealtime 后可重新绑定新 token 启动', () => {
    localStorage.setItem('token', 'T1')
    startRealtime()
    stopRealtime()
    localStorage.setItem('token', 'T2')
    const before = (globalThis as any).fetch.mock.calls.length
    startRealtime()
    const after = (globalThis as any).fetch.mock.calls.length
    expect(after).toBeGreaterThan(before)
  })
})
