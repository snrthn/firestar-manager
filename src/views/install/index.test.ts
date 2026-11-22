/**
 * 安装向导页回归测试（P0）。
 *
 * 锁定三条业务规则：
 * 1. 环境预检全通过 + 密码一致且 ≥6 位 → 初始化按钮才可用；
 * 2. 预检失败时按钮禁用且展示告警（不允许带病初始化）；
 * 3. 初始化成功后 refreshInitState 必须被调用（否则倒计时跳登录被旧缓存打回 /install）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'

const getInitStatusMock = vi.fn()
const getPrecheckMock = vi.fn()
const doInitMock = vi.fn()
const refreshInitStateMock = vi.fn()
const replaceMock = vi.fn()
const confirmMock = vi.fn()

vi.mock('@/api/system', () => ({
  getInitStatus: (...a: unknown[]) => getInitStatusMock(...a),
  getPrecheck: (...a: unknown[]) => getPrecheckMock(...a),
  doInit: (...a: unknown[]) => doInitMock(...a),
}))

vi.mock('@/router', () => ({
  refreshInitState: () => refreshInitStateMock(),
  getLastInitState: () => null,
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ replace: replaceMock }) }))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
  ElMessageBox: { confirm: (...a: unknown[]) => confirmMock(...a) },
}))

const passthrough = (tag: string) => defineComponent({ template: `<${tag}><slot/></${tag}>` })

import InstallPage from './index.vue'

function mountPage() {
  return mount(InstallPage, {
    global: {
      stubs: {
        'el-result': defineComponent({ props: ['title', 'subTitle'], template: '<div class="el-result"><slot name="extra"/></div>' }),
        'el-card': defineComponent({ template: '<div class="el-card"><slot name="header"/><slot/></div>' }),
        'el-form': passthrough('form'),
        'el-form-item': defineComponent({ template: '<div class="el-form-item"><slot/></div>' }),
        'el-input': defineComponent({
          props: ['modelValue', 'placeholder', 'type'],
          template: '<input :placeholder="placeholder" :type="type||\'text\'" :value="modelValue" @input="$emit(\'update:modelValue\',$event.target.value)" />',
        }),
        'el-button': defineComponent({
          props: ['disabled', 'loading', 'type'],
          template: '<button class="init-btn" :disabled="disabled"><slot/></button>',
        }),
        'el-tag': defineComponent({ template: '<i><slot/></i>' }),
        'el-alert': defineComponent({ props: ['title'], template: '<div class="el-alert">{{title}}</div>' }),
        'el-skeleton': defineComponent({ template: '<div/>' }),
      },
    },
  })
}

const okChecks = [
  { name: '数据库连通性', ok: true, detail: 'ok' },
  { name: '流程引擎表 (Flowable)', ok: true, detail: 'ok' },
  { name: '文件存储目录可写', ok: true, detail: 'ok' },
  { name: '磁盘可用空间 (≥100MB)', ok: true, detail: 'ok' },
  { name: 'JWT 密钥强度', ok: true, detail: 'ok' },
]

describe('install 安装向导页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getInitStatusMock.mockResolvedValue({ initialized: false, trialMode: true, canReset: false, adminExists: false })
    getPrecheckMock.mockResolvedValue(okChecks)
    confirmMock.mockResolvedValue(undefined)
  })

  it('预检全通过 + 两次密码一致（≥6位）→ 初始化按钮可用', async () => {
    const w = mountPage()
    await flushPromises()
    const vm = w.vm as any
    expect(vm.allCheckOk).toBe(true)

    vm.form.adminPassword = 'Admin@123'
    vm.confirmPwd = 'Admin@123'
    await flushPromises()
    expect(vm.canInit).toBe(true)
    expect(w.find('.init-btn').attributes('disabled')).toBeUndefined()
  })

  it('任一预检失败 → 按钮禁用并展示告警', async () => {
    getPrecheckMock.mockResolvedValue([...okChecks.slice(0, 4), { name: 'JWT 密钥强度', ok: false, detail: '默认密钥' }])
    const w = mountPage()
    await flushPromises()
    const vm = w.vm as any
    vm.form.adminPassword = 'Admin@123'
    vm.confirmPwd = 'Admin@123'
    await flushPromises()

    expect(vm.allCheckOk).toBe(false)
    expect(vm.canInit).toBe(false)
    expect(w.find('.init-btn').attributes('disabled')).toBeDefined()
    expect(w.text()).toContain('环境预检未全部通过')
  })

  it('两次密码不一致 → 按钮禁用（防手滑输错管理员密码）', async () => {
    const w = mountPage()
    await flushPromises()
    const vm = w.vm as any
    vm.form.adminPassword = 'Admin@123'
    vm.confirmPwd = 'Different@456'
    await flushPromises()
    expect(vm.canInit).toBe(false)
  })

  it('初始化成功后必须 refreshInitState（防倒计时跳登录被打回 /install）', async () => {
    doInitMock.mockResolvedValue({ initialized: true })
    refreshInitStateMock.mockResolvedValue(undefined)
    vi.useFakeTimers()
    const w = mountPage()
    await flushPromises()
    const vm = w.vm as any
    vm.form.adminPassword = 'Admin@123'
    vm.confirmPwd = 'Admin@123'
    await vm.onInstall()
    await flushPromises()

    expect(doInitMock).toHaveBeenCalledTimes(1)
    expect(refreshInitStateMock).toHaveBeenCalledTimes(1)
    expect(vm.installed).toBe(true)
    vi.useRealTimers()
  })

  it('已初始化时直接展示完成态，不再请求预检（后端会 403）', async () => {
    getInitStatusMock.mockResolvedValue({ initialized: true })
    mountPage()
    await flushPromises()
    expect(getPrecheckMock).not.toHaveBeenCalled()
  })
})
