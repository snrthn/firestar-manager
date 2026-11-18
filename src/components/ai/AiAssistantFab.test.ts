/**
 * AI 助手（云效式浮动面板）冒烟测试。
 *
 * 边界说明：
 *   - 组件库（vue-element-plus-x）与 Markdown 渲染器均为第三方大件，在 happy-dom 下挂载
 *     会产生大量与业务无关的报错（虚拟滚动测量、x-sender 富文本编辑器初始化）。这里只
 *     stub 掉**渲染层**，专注验证自研的「壳」：面板开合、发送流转、会话快照与回放。
 *   - SSE 客户端 @/api/ai#streamChat 也是 mock，避免测试依赖网络。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

const { streamChatMock } = vi.hoisted(() => ({ streamChatMock: vi.fn() }))

vi.mock('@/api/ai', () => ({
  streamChat: (...args: any[]) => streamChatMock(...args),
  fetchLatestDraft: vi.fn(async () => null),
}))

vi.mock('@/api/request', () => ({
  default: { post: vi.fn(async () => ({ data: { data: 1 } })) },
}))

vi.mock('./AiMarkdown.vue', () => ({
  default: defineComponent({
    name: 'AiMarkdown',
    props: { content: { type: String, default: '' } },
    setup: (props) => () => h('div', { class: 'md-stub' }, props.content),
  }),
}))

vi.mock('vue-element-plus-x', () => {
  const Welcome = defineComponent({
    name: 'Welcome',
    props: { title: String, description: String },
    setup:
      (props) =>
      () =>
        h('div', { class: 'welcome-stub' }, [h('h3', props.title), h('p', props.description)]),
  })

  const Thinking = defineComponent({
    name: 'Thinking',
    props: { content: String, status: String },
    setup:
      (props) =>
      () =>
        h('div', { class: 'thinking-stub' }, props.content),
  })

  const XSender = defineComponent({
    name: 'XSender',
    props: { loading: Boolean },
    emits: ['submit'],
    setup: (_, { slots, expose }) => {
      const text = { value: '' }
      expose({
        getModelValue: () => ({ text: '查一下正在进行的项目', html: '' }),
        clear: () => {
          text.value = ''
        },
        setText: (v: string) => {
          text.value = v
        },
        focus: () => undefined,
      })
      return () => h('div', { class: 'sender-stub' }, [slots.prefix?.()])
    },
  })

  const BubbleList = defineComponent({
    name: 'BubbleList',
    props: { list: { type: Array, default: () => [] }, itemType: String },
    setup: (props, { slots, expose }) => {
      // expose 只能在 setup 顶层调用一次（放在 render 里会触发 Vue warn）
      expose({ scrollToBottom: () => undefined })
      return () =>
        h(
          'div',
          { class: 'bubble-list-stub' },
          (props.list as any[]).map((item, index) =>
            h('div', { class: 'msg', 'data-role': item.role, key: item.id ?? index }, [
              slots.header?.({ item, index, itemType: item.itemType }),
              slots.content?.({ item, index, itemType: item.itemType }),
              slots.item?.({ item, index, itemType: item.itemType }),
            ]),
          ),
        )
    },
  })

  return { Welcome, Thinking, XSender, BubbleList }
})

import AiAssistantFab from './AiAssistantFab.vue'

/**
 * 模式菜单用 el-popover（历史会话同款链路）+ 自绘菜单项：el-dropdown 在本面板
 * （Teleport+Transition）里菜单不弹，且不存在 #reference 插槽、用错会炸
 * （见 AiAssistantFab.vue 内注释）。
 *
 * ElPopover stub：happy-dom 下真实 popover 的懒挂载依赖 popper 定位，点开无内容
 * （真实浏览器正常）。stub 成 reference+内容内联渲染，保住「点菜单项 → pickMode →
 * setMode → 模式切换」这条真实逻辑链路；弹出层样式与 z-index 由浏览器实测兜底。
 */
const ElPopoverStub = defineComponent({
  name: 'ElPopover',
  setup: (_, { slots }) => () =>
    h('div', { class: 'popover-stub' }, [slots.reference?.(), slots.default?.()]),
})

/** 通过菜单 UI 链路切模式：点头部菜单按钮，再点对应菜单项 */
async function pickModeViaMenu(wrapper: VueWrapper, m: 'float' | 'dock' | 'fullscreen') {
  await wrapper.find('.ai-icon-btn[title="显示模式"]').trigger('click')
  await flushPromises()
  const label = { float: '浮动', dock: '右侧停靠', fullscreen: '全屏' }[m]
  const item = wrapper.findAll('.ai-mode-item').find((w) => w.text().includes(label))
  if (!item) throw new Error(`模式菜单项 ${m} 未渲染`)
  await item.trigger('click')
  await flushPromises()
}

const mountFab = () =>
  mount(AiAssistantFab, {
    global: { plugins: [ElementPlus], stubs: { teleport: true, ElPopover: ElPopoverStub } },
  })

describe('AiAssistantFab（云效式面板）', () => {
  beforeEach(() => {
    streamChatMock.mockReset()
    sessionStorage.clear()
  })

  it('初始只渲染吸边入口，点击后打开右侧停靠面板（600px），入口随即隐藏', async () => {
    const wrapper = mountFab()
    expect(wrapper.find('.ai-panel').exists()).toBe(false)
    expect(wrapper.find('.ai-dock').exists()).toBe(true)

    await wrapper.find('.ai-dock').trigger('click')
    expect(wrapper.find('.ai-panel').exists()).toBe(true)
    expect(wrapper.text()).toContain('火星 AI 助手')

    // 每次打开都是右侧停靠（is-dock），宽度默认 600
    expect(wrapper.find('.ai-panel').classes()).toContain('is-dock')
    const box = boxOf(wrapper)
    expect(box.width).toBe(600)
    expect(box.left + box.width).toBe(window.innerWidth)
    expect(box.top).toBe(0)
    expect(box.height).toBe(window.innerHeight)

    // 打开后入口必须隐藏（避免遮挡对话）
    expect(wrapper.find('.ai-dock').exists()).toBe(false)

    // 空态只有欢迎文字，不再渲染示例提问
    expect(wrapper.find('.welcome-stub').exists()).toBe(true)
    expect(wrapper.find('.prompts-stub').exists()).toBe(false)
  })

  it('关闭面板后吸边入口重新出现，再次打开仍复位为停靠', async () => {
    const wrapper = mountFab()
    await wrapper.find('.ai-dock').trigger('click')

    // 切到浮动并拖走，再关闭（经真实菜单链路）
    await pickModeViaMenu(wrapper, 'float')
    await wrapper.find('.ai-hd').trigger('pointerdown', { button: 0, clientX: 900, clientY: 40 })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 200 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    await flushPromises()
    expect(wrapper.find('.ai-panel').classes()).toContain('is-float')

    const btns = wrapper.findAll('.ai-icon-btn')
    await btns[btns.length - 1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.ai-panel').exists()).toBe(false)
    expect(wrapper.find('.ai-dock').exists()).toBe(true)

    // 再打开：不管上次是浮动还是拖过，一律复位右侧停靠
    await wrapper.find('.ai-dock').trigger('click')
    expect(wrapper.find('.ai-panel').classes()).toContain('is-dock')
    expect(boxOf(wrapper).left + boxOf(wrapper).width).toBe(window.innerWidth)
  })

  /**
   * 几何行为（拖动/缩放）没有 UI 可断言，只能对样式值取证：
   * 面板布局走像素 left/top/width/height，直接用 inline style 读回。
   */
  const boxOf = (wrapper: any) => {
    const el = wrapper.find('.ai-panel').element as HTMLElement
    return {
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
    }
  }

  it('停靠模式下拖标题栏不移动、不改模式（模式只走下拉菜单）', async () => {
    const wrapper = mountFab()
    await wrapper.find('.ai-dock').trigger('click')
    const before = boxOf(wrapper)

    await wrapper.find('.ai-hd').trigger('pointerdown', { button: 0, clientX: 900, clientY: 40 })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 700, clientY: 200 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    await flushPromises()

    expect(wrapper.find('.ai-panel').classes()).toContain('is-dock')
    expect(boxOf(wrapper)).toEqual(before)
  })

  it('通过下拉菜单切浮动后：标题栏可拖动，右下角手柄斜向调宽高且左上角锁定', async () => {
    const wrapper = mountFab()
    await wrapper.find('.ai-dock').trigger('click')
    // 模式切换唯一入口：头部弹出菜单
    await pickModeViaMenu(wrapper, 'float')

    expect(wrapper.find('.ai-panel').classes()).toContain('is-float')
    const floated = boxOf(wrapper)
    expect(floated.height).toBeLessThan(window.innerHeight)

    // 拖标题栏移动：位移 = 指针从 (900,40) 到 (800,120)
    await wrapper.find('.ai-hd').trigger('pointerdown', { button: 0, clientX: 900, clientY: 40 })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 800, clientY: 120 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    await flushPromises()
    const moved = boxOf(wrapper)
    expect(moved.left).toBe(floated.left - 100)
    expect(moved.top).toBe(floated.top + 80)

    // 右下角斜向缩放：向右下拉 40px（加宽加高）；高度加到超出视口时会被 clamp，
    // 所以这里先向右下拉（加宽），再向左上收（减高），两种方向都验证、左上角始终锁定
    await wrapper
      .find('.ai-rs--br')
      .trigger('pointerdown', { button: 0, clientX: moved.left + moved.width, clientY: moved.top + moved.height })
    window.dispatchEvent(
      new MouseEvent('pointermove', { clientX: moved.left + moved.width + 40, clientY: moved.top + moved.height + 40 }),
    )
    window.dispatchEvent(new MouseEvent('pointerup'))
    await flushPromises()

    const widened = boxOf(wrapper)
    expect(widened.width).toBe(moved.width + 40)
    // top=96 时视口只剩 768-96=672 的高度余量，超出部分被 clamp 吃掉，高度不变
    expect(widened.height).toBe(moved.height)
    expect(widened.left).toBe(moved.left)
    expect(widened.top).toBe(moved.top)

    // 向左上收 40px：高度 -40、宽度 -40，左上角仍锁定
    await wrapper
      .find('.ai-rs--br')
      .trigger('pointerdown', { button: 0, clientX: widened.left + widened.width, clientY: widened.top + widened.height })
    window.dispatchEvent(
      new MouseEvent('pointermove', {
        clientX: widened.left + widened.width - 40,
        clientY: widened.top + widened.height - 40,
      }),
    )
    window.dispatchEvent(new MouseEvent('pointerup'))
    await flushPromises()

    const resized = boxOf(wrapper)
    expect(resized.width).toBe(widened.width - 40)
    expect(resized.height).toBe(widened.height - 40)
    expect(resized.left).toBe(widened.left)
    expect(resized.top).toBe(widened.top)
    expect(wrapper.find('.ai-panel').classes()).toContain('is-float')

    // 切回停靠：恢复贴边、占满高
    await pickModeViaMenu(wrapper, 'dock')
    const dock = boxOf(wrapper)
    expect(wrapper.find('.ai-panel').classes()).toContain('is-dock')
    expect(dock.height).toBe(window.innerHeight)
    expect(dock.left + dock.width).toBe(window.innerWidth)
  })

  it('停靠模式拖左边缘：只改宽度，右边缘保持贴边、模式不变，重开仍记住新宽度', async () => {
    const wrapper = mountFab()
    await wrapper.find('.ai-dock').trigger('click')
    const before = boxOf(wrapper)

    // 向左拖 80px：宽度 +80
    await wrapper.find('.ai-rs--l').trigger('pointerdown', { button: 0, clientX: before.left, clientY: 300 })
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: before.left - 80, clientY: 300 }))
    window.dispatchEvent(new MouseEvent('pointerup'))
    await flushPromises()

    const after = boxOf(wrapper)
    expect(wrapper.find('.ai-panel').classes()).toContain('is-dock')
    expect(after.width).toBe(before.width + 80)
    expect(after.left + after.width).toBe(window.innerWidth)
    expect(after.height).toBe(window.innerHeight)
    // 拖左边缘不能把模式拖成浮动
    expect(wrapper.find('.ai-panel').classes()).not.toContain('is-float')

    // 关闭再打开：宽度记忆保留，仍贴边
    const btns = wrapper.findAll('.ai-icon-btn')
    await btns[btns.length - 1].trigger('click')
    await wrapper.find('.ai-dock').trigger('click')
    const reopened = boxOf(wrapper)
    expect(reopened.width).toBe(before.width + 80)
    expect(reopened.left + reopened.width).toBe(window.innerWidth)
  })

  it('发送后流式内容落到气泡，结束后写入本地会话快照', async () => {
    streamChatMock.mockImplementation(async (_msg: string, handlers: any) => {
      handlers.onToken('**你好**，项目 A 正在执行')
      handlers.onDone()
    })

    const wrapper = mountFab()
    await wrapper.find('.ai-dock').trigger('click')
    wrapper.findComponent({ name: 'XSender' }).vm.$emit('submit')
    await flushPromises()

    expect(streamChatMock).toHaveBeenCalledTimes(1)
    // 用户消息 + AI 消息
    expect(wrapper.findAll('.msg').length).toBe(2)
    expect(wrapper.find('.md-stub').text()).toContain('**你好**')

    const stored = JSON.parse(sessionStorage.getItem('firestar_ai_local_convs_v1') || '[]')
    expect(stored.length).toBe(1)
    expect(stored[0].title).toContain('查一下正在进行的项目')
    expect(stored[0].items.length).toBe(2)
  })

  it('新建会话清空当前消息但保留历史快照', async () => {
    streamChatMock.mockImplementation(async (_msg: string, handlers: any) => {
      handlers.onToken('回答内容')
      handlers.onDone()
    })

    const wrapper = mountFab()
    await wrapper.find('.ai-dock').trigger('click')
    wrapper.findComponent({ name: 'XSender' }).vm.$emit('submit')
    await flushPromises()
    expect(wrapper.findAll('.msg').length).toBe(2)

    // 头部第一个图标按钮 = 新建会话
    await wrapper.findAll('.ai-icon-btn')[0].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.msg').length).toBe(0)
    expect(wrapper.find('.welcome-stub').exists()).toBe(true)
    const stored = JSON.parse(sessionStorage.getItem('firestar_ai_local_convs_v1') || '[]')
    expect(stored.length).toBe(1)
    expect(stored[0].items.length).toBe(2)
  })

  it('停止生成时保留已输出内容并标记取消', async () => {
    // 模拟一个永不结束的流：只吐 token，不回调 done
    streamChatMock.mockImplementation(async (_msg: string, handlers: any, opts: any) => {
      handlers.onToken('部分内容')
      await new Promise<void>((resolve) => {
        opts.signal.addEventListener('abort', () => {
          handlers.onStopped?.()
          resolve()
        })
      })
    })

    const wrapper = mountFab()
    await wrapper.find('.ai-dock').trigger('click')
    wrapper.findComponent({ name: 'XSender' }).vm.$emit('submit')
    await flushPromises()

    expect(wrapper.find('.ai-stop').exists()).toBe(true)
    await wrapper.find('.ai-stop button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.md-stub').text()).toContain('部分内容')
    expect(wrapper.find('.ai-stop').exists()).toBe(false)
  })
})
