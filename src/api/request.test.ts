import { describe, it, expect, vi, beforeEach } from 'vitest'

// 验证 axios 响应拦截器：401 时把「本次请求实际携带的 token」透传给会话守卫，
// 使僵尸请求（重登录后用旧 token 发出的请求 401）被静默忽略，不误清新会话。
// 同 finance/sessionGuard：vi.mock 工厂被提升，mock 必须先经 vi.hoisted 建好。
const mocks = vi.hoisted(() => ({
  expired: vi.fn(),
  hang: vi.fn(() => new Promise<never>(() => {})),
}))
const expiredMock = mocks.expired
const hangMock = mocks.hang

vi.mock('@/api/sessionGuard', () => ({
  handleSessionExpired: mocks.expired,
  hangSilently: mocks.hang,
}))

import request from './request'

// axios 把拦截器链放在内部属性 handlers 上，类型声明为可选、回调也可空，
// 直接取 [0] 会同时触发 TS18048（可能 undefined）与 TS2722（可能不可调用）。
// 统一在这里收窄一次：测试若拿不到拦截器，应当直接失败而不是静默跳过。
type ResponseHandler = {
  fulfilled: (value: any) => any
  rejected: (error: any) => any
}
function firstResponseHandler(): ResponseHandler {
  const chain = request.interceptors.response as unknown as { handlers?: ResponseHandler[] }
  const handler = chain.handlers?.[0]
  if (!handler) throw new Error('响应拦截器未注册：request.ts 应调用 interceptors.response.use')
  return handler
}

beforeEach(() => {
  expiredMock.mockClear()
  hangMock.mockClear()
  localStorage.clear()
})

describe('request 401 拦截器 · 僵尸 token 透传（P0）', () => {
  it('401 时把请求携带的 token 透传给守卫：旧 token 触发静默忽略', () => {
    localStorage.setItem('token', 'NEW')
    const handler = firstResponseHandler()
    const err = {
      response: { status: 401, data: { message: 'kicked' } },
      config: { headers: { Authorization: 'Bearer OLD' } },
    }
    handler.rejected(err)
    expect(expiredMock).toHaveBeenCalledWith('kicked', 'OLD')
    expect(hangMock).toHaveBeenCalled() // 页级 catch 被挂起，避免重复 toast
  })

  it('401 且请求未带 token：rejectedToken 为 undefined → 守卫照旧弹框', () => {
    localStorage.setItem('token', 'CUR')
    const handler = firstResponseHandler()
    handler.rejected({ response: { status: 401, data: { message: 'm' } }, config: { headers: {} } })
    expect(expiredMock).toHaveBeenCalledWith('m', undefined)
  })

  it('非 401 错误：用后端 message 覆盖 error.message（避免 axios 英文串）', async () => {
    const handler = firstResponseHandler()
    const err: any = {
      message: 'Request failed with status code 403',
      response: { data: { message: '无权限访问该资源' } },
    }
    // rejected 返回 Promise.reject(err)，不接住会变成 unhandled rejection。
    await expect(handler.rejected(err)).rejects.toBe(err)
    expect(err.message).toBe('无权限访问该资源')
  })

  it('业务码非 0（HTTP 200）走 reject 而非正常返回', async () => {
    const handler = firstResponseHandler()
    const res: any = { data: { code: 500, message: '服务器内部错误' } }
    // fulfilled 走 Promise.reject，不会同步 throw；旧断言 toThrow() 永远失败，
    // 且会产生一条 unhandled rejection。改为断言 rejected promise 的错误信息。
    await expect(handler.fulfilled(res)).rejects.toThrow('服务器内部错误')
  })
})
