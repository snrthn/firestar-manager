/**
 * AiThinking（思考过程折叠组件）单元测试。
 * fake timers 驱动「用时 N 秒」的计时逻辑；交互覆盖展开/折叠/自动折叠。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AiThinking from './AiThinking.vue'

/** v-show 折叠断言：test-utils 的 isVisible 依赖 getComputedStyle，在游离 DOM（happy-dom）下不可靠，
 *  改断言内联 style（v-show 直接写 display:none） */
const isFolded = (w: { find: (s: string) => { attributes: (a: string) => string | undefined } }) =>
  (w.find('.ai-think__body').attributes('style') ?? '').includes('display: none')

describe('AiThinking', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('思考中：展开、流光标签、内容跟随', () => {
    const w = mount(AiThinking, { props: { content: '先查知识库', status: 'thinking' } })
    expect(w.find('.ai-think').classes()).toContain('is-thinking')
    expect(w.text()).toContain('思考中')
    expect(isFolded(w)).toBe(false)
    expect(w.find('.ai-think__text').text()).toBe('先查知识库')
  })

  it('完成后自动折叠并显示用时；点击可展开回看', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-19T00:00:00'))
    const w = mount(AiThinking, { props: { content: '', status: 'thinking' } })
    await w.setProps({ content: '分析中…' })
    // 流式耗时 2.2 秒
    vi.advanceTimersByTime(2200)
    await w.setProps({ status: 'end' })

    expect(w.text()).toContain('已深度思考')
    expect(w.text()).toContain('用时 2 秒')
    expect(isFolded(w)).toBe(true)

    await w.find('.ai-think__hd').trigger('click')
    expect(isFolded(w)).toBe(false)
    expect(w.find('.ai-think__text').text()).toBe('分析中…')
  })

  it('停止生成显示「已停止思考」；历史回放（直接 end 挂载）默认折叠不显示用时', () => {
    const stop = mount(AiThinking, { props: { content: '半截思考', status: 'cancel' } })
    expect(stop.text()).toContain('已停止思考')

    const replay = mount(AiThinking, { props: { content: '历史思考', status: 'end' } })
    expect(replay.text()).toContain('已深度思考')
    expect(replay.text()).not.toContain('用时')
    expect(isFolded(replay)).toBe(true)
  })

  it('思考文本兜底清洗 DSML：展开后不露出 <|DSML|> 伪调用标签', async () => {
    const raw = [
      '我来查询文件列表。',
      '<|DSML|> calls>',
      '<|DSML|> invoke name="search_files">',
      '</|DSML|> invoke>',
      '</|DSML|> calls>',
    ].join('\n')
    const w = mount(AiThinking, { props: { content: raw, status: 'end' } })
    await w.find('.ai-think__hd').trigger('click') // 展开回看
    const text = w.find('.ai-think__text').text()
    expect(text).toBe('我来查询文件列表。')
    expect(text).not.toContain('DSML')
  })
})
