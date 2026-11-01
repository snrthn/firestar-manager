import { describe, it, expect, vi, beforeEach } from 'vitest'

// 验证 axios 响应拦截器：401 时把「本次请求实际携带的 token」透传给会话守卫，
// 使僵尸请求（重登录后用旧 token 发出的请求 401）被静默忽略，不误清新会话。
const expiredMock = vi.fn()
const hangMock = vi.fn(() => new Promise<never>(() => {}))
vi.mock('@/api/sessionGuard', () => ({
  handleSessionExpired: expiredMock,
  hangSilently: hangMock,
}))

import request from './request'

beforeEach(() => {
  expiredMock.mockClear()
  hangMock.mockClear()
  localStorage.clear()
})

describe('request 401 拦截器 · 僵尸 token 透传（P0）', () => {
  it('401 时把请求携带的 token 透传给守卫：旧 token 触发静默忽略', () => {
    localStorage.setItem('token', 'NEW')
    const handler = request.interceptors.response.handlers[0]
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
    const handler = request.interceptors.response.handlers[0]
    handler.rejected({ response: { status: 401, data: { message: 'm' } }, config: { headers: {} } })
    expect(expiredMock).toHaveBeenCalledWith('m', undefined)
  })

  it('非 401 错误：用后端 message 覆盖 error.message（避免 axios 英文串）', () => {
    const handler = request.interceptors.response.handlers[0]
    const err: any = {
      message: 'Request failed with status code 403',
      response: { data: { message: '无权限访问该资源' } },
    }
    handler.rejected(err)
    expect(err.message).toBe('无权限访问该资源')
  })

  it('业务码非 0（HTTP 200）走 reject 而非正常返回', () => {
    const handler = request.interceptors.response.handlers[0]
    const res: any = { data: { code: 500, message: '服务器内部错误' } }
    expect(() => handler.fulfilled(res)).toThrow() // Promise.reject 在微任务，这里验证不为正常 resolve 路径
  })
})
