/**
 * 系统重置页回归测试（2026-11-22 两个 P0 修复的护栏）。
 *
 * 覆盖：
 * 1. 状态卡必须走鉴权端点 getResetStatus（不再误用被裁剪的匿名端点）
 * 2. canReset=true 时按钮可用；canReset=false 时按钮禁用
 * 3. 执行重置必须携带管理员密码
 * 4. full reset 返回 requireReinstall=true 时：登出 + 跳 /install
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'

const getResetStatusMock = vi.fn()
const resetLightMock = vi.fn()
const resetFullMock = vi.fn()
const replaceMock = vi.fn()
const logoutLocalMock = vi.fn()
const refreshInitStateMock = vi.fn()

vi.mock('@/api/system', () => ({
  getResetStatus: (...args: unknown[]) => getResetStatusMock(...args),
  resetLight: (...args: unknown[]) => resetLightMock(...args),
  resetFull: (...args: unknown[]) => resetFullMock(...args),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: replaceMock }),
}))

vi.mock('@/router', () => ({
  refreshInitState: () => refreshInitStateMock(),
}))

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({
    hasPermission: () => true,
    logoutLocal: logoutLocalMock,
  }),
}))

// v-has-perm：测试里放行
const hasPerm = {
  mounted(el: HTMLElement) { el.dataset.permBound = '1' },
}

import ResetPage from './reset.vue'

/**
 * Element Plus 组件在本项目未做全局注册（main.ts 里 register，测试不加载），
 * 必须用带插槽透传的 stub 才能让 el-card / el-form 的内容进入 DOM；
 * 否则 find('.ir-reset-actions button') 恒为空。
 */
const passthrough = (tag: string) => defineComponent({
  name: tag,
  template: `<${tag}><slot /></${tag}>`,
})

function mountPage() {
  return mount(ResetPage, {
    global: {
      directives: { hasPerm },
      stubs: {
        'el-card': defineComponent({ template: '<div class="el-card-stub"><slot name="header"/><slot/></div>' }),
        'el-alert': defineComponent({ props: ['title', 'type'], template: '<div class="el-alert-stub">{{title}}<slot/></div>' }),
        'el-form': passthrough('form'),
        'el-form-item': defineComponent({ template: '<div class="el-form-item-stub"><slot/></div>' }),
        'el-input': defineComponent({
          props: ['modelValue', 'placeholder', 'type'],
          template: '<input :placeholder="placeholder" :type="type||\'text\'" :value="modelValue" @input="$emit(\'update:modelValue\',$event.target.value)" />',
        }),
        'el-button': defineComponent({
          props: ['disabled', 'loading', 'type'],
          template: '<button :disabled="disabled"><slot/></button>',
        }),
        'el-descriptions': passthrough('div'),
        'el-descriptions-item': defineComponent({ props: ['label'], template: '<div class="desc-item"><slot/></div>' }),
        'el-tag': defineComponent({ template: '<i class="el-tag-stub"><slot/></i>' }),
        'el-dialog': defineComponent({ props: ['modelValue'], template: '<div class="el-dialog-stub" v-if="modelValue"><slot/></div>' }),
        'el-skeleton': defineComponent({ template: '<div class="skeleton"/>' }),
      },
    },
  })
}

describe('system/reset 系统重置页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getResetStatusMock.mockResolvedValue({
      initialized: true,
      trialMode: true,
      canReset: true,
      adminExists: true,
      lastResetTime: null,
      lastResetBy: null,
    })
  })

  it('onMounted 调 getResetStatus（鉴权完整态），不调匿名端点', async () => {
    mountPage()
    await flushPromises()
    expect(getResetStatusMock).toHaveBeenCalledTimes(1)
  })

  it('canReset=true 时两个重置按钮可用；false 时禁用', async () => {
    const w = mountPage()
    await flushPromises()
    const btns = w.findAll('.ir-reset-actions button')
    expect(btns).toHaveLength(2)
    expect(btns.every((b) => !b.attributes('disabled'))).toBe(true)

    getResetStatusMock.mockResolvedValue({
      initialized: true,
      trialMode: false,
      canReset: false,
      adminExists: true,
    })
    const w2 = mountPage()
    await flushPromises()
    expect(w2.findAll('.ir-reset-actions button').every((b) => b.attributes('disabled') !== undefined)).toBe(true)
  })

  it('执行重置时请求体必须带 password（后端二次身份校验契约）', async () => {
    resetLightMock.mockResolvedValue({ executed: false, verifyCode: '123456' })
    const w = mountPage()
    await flushPromises()

    // 走真实交互：打开对话框 → 输入确认词 → 获取验证码
    await w.findAll('.ir-reset-actions button')[0].trigger('click')
    const confirmInput = w.find('input[placeholder="请输入 RESET"]')
    expect(confirmInput.exists()).toBe(true)
    await confirmInput.setValue('RESET')
    await (w.vm as any).requestVerifyCode()
    await flushPromises()
    expect(resetLightMock).toHaveBeenLastCalledWith({ confirmText: 'RESET' })
    expect((w.vm as any).generatedCode).toBe('123456')

    // 输入密码后执行：密码必须透传到后端
    const pwdInput = w.find('input[placeholder="请输入当前登录账号的密码"]')
    await pwdInput.setValue('Admin@123')
    ;(w.vm as any).verifyCode = '123456'
    resetLightMock.mockResolvedValue({ executed: true, message: '重置完成' })
    await (w.vm as any).executeReset()
    expect(resetLightMock).toHaveBeenLastCalledWith({
      confirmText: 'RESET',
      verifyCode: '123456',
      password: 'Admin@123',
    })
  })

  it('完整重置 requireReinstall=true → 登出 + 跳安装向导', async () => {
    resetFullMock.mockResolvedValue({ executed: true, requireReinstall: true })
    refreshInitStateMock.mockResolvedValue({ initialized: false })
    const w = mountPage()
    await flushPromises()
    ;(w.vm as any).resetType = 'full'
    ;(w.vm as any).adminPassword = 'Admin@123'
    ;(w.vm as any).verifyCode = '654321'
    await (w.vm as any).executeReset()
    await flushPromises()

    expect(resetFullMock).toHaveBeenCalledWith({
      confirmText: 'RESET',
      verifyCode: '654321',
      password: 'Admin@123',
    })
    expect(logoutLocalMock).toHaveBeenCalledTimes(1)
    expect(refreshInitStateMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/install')
  })

  it('轻度重置 requireReinstall=false → 保持登录、刷新状态', async () => {
    resetLightMock.mockResolvedValue({ executed: true, requireReinstall: false })
    const w = mountPage()
    await flushPromises()
    ;(w.vm as any).adminPassword = 'Admin@123'
    ;(w.vm as any).verifyCode = '111111'
    await (w.vm as any).executeReset()
    await flushPromises()

    expect(logoutLocalMock).not.toHaveBeenCalled()
    expect(replaceMock).not.toHaveBeenCalled()
    expect(getResetStatusMock).toHaveBeenCalledTimes(2) // 挂载 + 重置后刷新
  })
})
