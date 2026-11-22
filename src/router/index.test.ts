/**
 * 路由初始化状态缓存契约（P0 回归护栏）。
 *
 * 背景：router/index.ts 的 cachedInitState/lastInitState 是历史 bug 高发区——
 * 2026-10-21「初始化完成后倒计时不跳登录」就是缓存了 initialized=false 导致守卫
 * 把导航打回 /install；修复方式是「只缓存 true 的确定态 + refreshInitState 作废重探」。
 *
 * 本测试锁定这两条契约；beforeEach 的完整分流派（401 循环等）依赖真实 router
 * 实例与 Pinia，放 e2e 层覆盖，这里不重复。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getInitStatusMock = vi.fn()

vi.mock('@/api/system', () => ({
  getInitStatus: (...args: unknown[]) => getInitStatusMock(...args),
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ userInfo: null, menus: [], fetchProfile: vi.fn(), fetchMenus: vi.fn() }),
}))

vi.mock('@/utils/realtimeClient', () => ({
  startRealtime: vi.fn(),
  stopRealtime: vi.fn(),
}))

import { refreshInitState, getLastInitState } from './index'

describe('router 初始化状态缓存', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('refreshInitState 重新探测并把完整状态写入 lastInitState', async () => {
    const fresh = { initialized: true, trialMode: true, canReset: true, adminExists: true }
    getInitStatusMock.mockResolvedValue(fresh)

    const st = await refreshInitState()

    expect(getInitStatusMock).toHaveBeenCalledTimes(1)
    expect(st).toEqual(fresh)
    expect(getLastInitState()).toEqual(fresh)
  })

  it('完整重置后 initialized=false 也能被刷新进去（不被旧 true 缓存挡住）', async () => {
    getInitStatusMock.mockResolvedValue({ initialized: true, trialMode: true, canReset: true, adminExists: true })
    await refreshInitState()

    getInitStatusMock.mockResolvedValue({ initialized: false, trialMode: true, canReset: false, adminExists: false })
    const st = await refreshInitState()

    expect(st.initialized).toBe(false)
    expect(getLastInitState()?.initialized).toBe(false)
  })

  it('探测失败时保守兜底为已初始化，避免安装页卡死', async () => {
    getInitStatusMock.mockRejectedValue(new Error('后端不可用'))

    const st = await refreshInitState()

    expect(st.initialized).toBe(true)
    expect(st.adminExists).toBe(true)
    expect(getLastInitState()?.initialized).toBe(true)
  })
})
