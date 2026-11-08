import { describe, it, expect, vi, beforeEach } from 'vitest'

// 隔离 router 与 Element Plus 弹框，聚焦 handleSessionExpired 的「僵尸 token」分支判断。
// 这是 P0 登录流竞态修复的核心：旧 SSE/旧请求 401 若携带的是旧 token，必须静默忽略，
// 否则会出现「刚登录就被踢」。
// vi.mock 工厂被提升到 import 之前，普通 const 变量此时尚未初始化
// （ReferenceError: Cannot access 'pushMock' before initialization）→ 用 vi.hoisted。
const mocks = vi.hoisted(() => ({ push: vi.fn(), alert: vi.fn() }))
const pushMock = mocks.push
const alertMock = mocks.alert

vi.mock('@/router', () => ({
  default: { currentRoute: { value: { path: '/dashboard' } }, push: mocks.push },
}))
vi.mock('element-plus/es/components/message-box/index.mjs', () => ({
  default: {
    alert: (...args: unknown[]) => {
      mocks.alert(...args)
      // 模拟 ElMessageBox.alert 返回的 thenable：catch/finally 链，finally 同步执行
      const chain = {
        catch: () => chain,
        finally: (cb: () => void) => {
          cb()
          return chain
        },
      }
      return chain
    },
  },
}))

import { handleSessionExpired } from './sessionGuard'

beforeEach(() => {
  localStorage.clear()
  alertMock.mockClear()
  pushMock.mockClear()
})

describe('handleSessionExpired · 僵尸 token 保护（P0 登录流核心修复）', () => {
  it('rejectedToken 为旧 token（≠ 当前）时静默忽略：不弹框、不清 token、不跳登录', () => {
    localStorage.setItem('token', 'NEW')
    handleSessionExpired('您的账号已在其他设备登录', 'OLD')
    expect(alertMock).not.toHaveBeenCalled()
    expect(localStorage.getItem('token')).toBe('NEW')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('rejectedToken === 当前 token：弹框 + 清 token + 跳登录', () => {
    localStorage.setItem('token', 'SAME')
    handleSessionExpired('msg', 'SAME')
    expect(alertMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBeNull()
    expect(pushMock).toHaveBeenCalledWith('/login')
  })

  it('不传 rejectedToken：视为当前会话，照旧弹框清 token', () => {
    localStorage.setItem('token', 'CUR')
    handleSessionExpired()
    expect(alertMock).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('token')).toBeNull()
    expect(pushMock).toHaveBeenCalledWith('/login')
  })

  it('已在登录页（/login）时不重复跳登录', () => {
    // 复用 router mock，但把 path 设为 /login 验证分支
    const loginPush = vi.fn()
    vi.doMock('@/router', () => ({
      default: { currentRoute: { value: { path: '/login' } }, push: loginPush },
    }))
    localStorage.setItem('token', 'CUR')
    handleSessionExpired('m', 'CUR')
    expect(alertMock).toHaveBeenCalled()
    expect(loginPush).not.toHaveBeenCalled()
  })
})
