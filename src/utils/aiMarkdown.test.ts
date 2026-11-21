import { describe, it, expect } from 'vitest'
import { cleanAiMarkdown } from './aiMarkdown'

describe('cleanAiMarkdown（DSML 兜底清洗）', () => {
  it('剥离 DSML 伪工具调用块及其标签尾巴', () => {
    const raw = [
      '我在知识库中查一下。',
      '<|DSML|> calls>',
      '<|DSML|> invoke name="search_knowledge">',
      '<|DSML|> parameter name="query" string="true">底库化 来源</|DSML|> parameter>',
      '<|DSML|> parameter name="topK" string="false">8</|DSML|> parameter>',
      '</|DSML|> invoke>',
      '</|DSML|> calls>',
      '查到的结果如下：A、B。',
    ].join('\n')
    expect(cleanAiMarkdown(raw)).toBe('我在知识库中查一下。\n查到的结果如下：A、B。')
  })

  it('保留正常 GFM 表格与正文，纯竖线空行才删', () => {
    const raw = ['结论：', '| 项目 | 金额 |', '| --- | --- |', '| A | 100 |', '| |', '完毕。'].join('\n')
    expect(cleanAiMarkdown(raw)).toBe('结论：\n| 项目 | 金额 |\n| --- | --- |\n| A | 100 |\n完毕。')
  })

  it('无噪声时原样返回（不含连续空行）', () => {
    expect(cleanAiMarkdown('普通回答\n第二行')).toBe('普通回答\n第二行')
  })

  it('空串与多余空行', () => {
    expect(cleanAiMarkdown('')).toBe('')
    expect(cleanAiMarkdown('A。\n\n\n\nB。')).toBe('A。\n\nB。')
  })

  it('去掉模型回答末尾换行，避免渲染出空段落把操作栏顶远', () => {
    expect(cleanAiMarkdown('补充说明：只能走管理员重置流程。\n\n')).toBe('补充说明：只能走管理员重置流程。')
    expect(cleanAiMarkdown('结论。\n  \n\t')).toBe('结论。')
  })

  it('请求 9c476e37 真实落库的 DSML 变体：无 parameter 行、开标签带 calls>/invoke>', () => {
    const raw = [
      '我来查询文件列表，并查看系统返回的文件总数。',
      '',
      '<|DSML|> calls>',
      '<|DSML|> invoke name="search_files">',
      '',
      '</|DSML|> invoke>',
      '</|DSML|> calls>',
    ].join('\n')
    expect(cleanAiMarkdown(raw)).toBe('我来查询文件列表，并查看系统返回的文件总数。')
  })
})
