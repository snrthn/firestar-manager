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

describe('normalizeAiMarkdown（扣子无换行伪 Markdown 恢复）', () => {
  it('msg 276 真实片段：行内 ### 标题连写 → 断行 + 补空格', () => {
    const raw = '如果忘记登录密码，可按以下通用步骤处理：###1.优先走官方自助找回通道平台登录页面一般都有入口。'
    expect(cleanAiMarkdown(raw)).toBe(
      '如果忘记登录密码，可按以下通用步骤处理：\n\n### 1.优先走官方自助找回通道平台登录页面一般都有入口。',
    )
  })

  it('msg 276 真实片段：标点后紧跟「-列表项」→ 断行 + 补空格', () => {
    const raw = '就能直接重置新密码：-最常用的是手机号验证：输入手机号，收取验证码；-如果绑定过邮箱：选择邮箱验证。'
    expect(cleanAiMarkdown(raw)).toBe(
      '就能直接重置新密码：\n- 最常用的是手机号验证：输入手机号，收取验证码；\n- 如果绑定过邮箱：选择邮箱验证。',
    )
  })

  it('msg 276 真实片段：标点后紧跟「1.条目」→ 断行 + 补空格；不误伤小数与版本号', () => {
    expect(cleanAiMarkdown('注意事项：1.重置密码建议用强口令；2.及时更新绑定信息。')).toBe(
      '注意事项：\n1. 重置密码建议用强口令；\n2. 及时更新绑定信息。',
    )
    // 小数 / 版本号不受影响
    expect(cleanAiMarkdown('圆周率约等于3.14，版本号v1.2已发布。')).toBe('圆周率约等于3.14，版本号v1.2已发布。')
  })

  it('合法 Markdown 不被改动（幂等）', () => {
    const proper = '# 标题\n\n## 二级标题\n\n- 第一项\n- 第二项\n\n1. 条目一\n2. 条目二\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'
    expect(cleanAiMarkdown(proper)).toBe(proper)
  })

  it('数字区间与连接号不被误断', () => {
    expect(cleanAiMarkdown('服务时间：2020-2021年，共10-20人。')).toBe('服务时间：2020-2021年，共10-20人。')
  })

  it('围栏代码块内容整体跳过', () => {
    const raw = '参考下面命令：\n```bash\n# 这是注释\nrun-1.0\n```'
    expect(cleanAiMarkdown(raw)).toBe('参考下面命令：\n```bash\n# 这是注释\nrun-1.0\n```')
  })
})
