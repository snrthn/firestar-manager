import { describe, it, expect } from 'vitest'
import { cleanAiMarkdown, normalizeAiMarkdown } from './aiMarkdown'

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

  it('连体伪表格（请求 f2f881c9 真实落库）：|| 行边界拆成合法 GFM 表格', () => {
    const raw =
      '当前待开票金额为 **618.0元**。本月开票相关核心指标汇总：|指标 |数值 || ---- | ---- ||累计开票总金额（含税） |11425.0元 ||其中税额 |1487.5元 ||待开票余额 |618.0元 |'
    const expected = [
      '当前待开票金额为 **618.0元**。本月开票相关核心指标汇总：',
      '',
      '|指标 |数值 |',
      '| ---- | ---- |',
      '|累计开票总金额（含税） |11425.0元 |',
      '|其中税额 |1487.5元 |',
      '|待开票余额 |618.0元 |',
    ].join('\n')
    expect(normalizeAiMarkdown(raw)).toBe(expected)
  })

  it('有分隔行特征但双竖线带空格（空单元格写法）不命中拆行', () => {
    const raw = '| 项目 | 金额 |\n| --- | --- |\n| A | | 100 |'
    expect(normalizeAiMarkdown(raw)).toBe(raw)
  })

  it('连体伪表格变体（请求 4970e028 真实落库）：| | 带空格连体 + 列表项上下文 + 表尾连写结论句', () => {
    const raw =
      '正在为你统计马占山名下的全部项目清单及数量。马占山作为负责人发起的项目相关统计如下：1.项目总数：共1个，项目详情： |项目编号 |项目名称 |合同额 |累计回款 | | --- | --- | --- | --- | | PJ-20261030-0001 |开山项目 |1000000.0元 |80000.0元 |2.全周期累计总回款金额：80000.0元，该项目当前回款率为8%。'
    const expected = [
      '正在为你统计马占山名下的全部项目清单及数量。马占山作为负责人发起的项目相关统计如下：',
      '1. 项目总数：共1个，项目详情：',
      '',
      '|项目编号 |项目名称 |合同额 |累计回款 |',
      '| --- | --- | --- | --- |',
      '| PJ-20261030-0001 |开山项目 |1000000.0元 |80000.0元 |',
      '',
      '2. 全周期累计总回款金额：80000.0元，该项目当前回款率为8%。',
    ].join('\n')
    expect(normalizeAiMarkdown(raw)).toBe(expected)
  })

  it('代码块内的伪表格样例原样保留', () => {
    const raw = '示例：\n```\n|指标 |数值 || ---- | ---- ||A |1 |\n```\n完毕。'
    expect(normalizeAiMarkdown(raw)).toBe(raw)
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
