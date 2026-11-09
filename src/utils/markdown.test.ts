import { describe, it, expect } from 'vitest'
import {
  BLOCKED_IMAGE_TEXT,
  preprocessImageLinks,
  renderMarkdown,
  collectFileRefs,
  extractHeadings,
  validateMarkdown,
} from './markdown'

// 统一渲染管线的安全与切片契约。这些用例是 docs/知识库模块设计.md §8 步骤 4 的验收点：
// 禁 raw HTML（XSS 用例）、图片协议白名单、签名 URL 路径、heading 出处、MD 规范校验。
const API = '/api'

describe('preprocessImageLinks —— 图片协议白名单', () => {
  it('只允许 file:<数字>，换成内网字节接口相对路径', () => {
    expect(preprocessImageLinks('![流程图](file:123)', API)).toBe(
      '![流程图](/api/files/123/raw)',
    )
  })

  it('外链 / data: / javascript: / 相对路径图片一律拦截成可见占位', () => {
    const cases = [
      '![x](https://evil.com/a.png)',
      '![x](http://evil.com/a.png)',
      '![x](data:image/png;base64,AAAA)',
      '![x](javascript:alert(1))',
      '![x](/files/123/raw)',
    ]
    for (const c of cases) {
      const out = preprocessImageLinks(c, API)
      expect(out).toContain(BLOCKED_IMAGE_TEXT)
      expect(out).not.toContain('<img')
      expect(out).not.toContain('evil.com')
      expect(out).not.toContain('javascript:')
    }
  })

  it('file: 后面必须跟纯数字，file:abc / file:1x 也要拦', () => {
    expect(preprocessImageLinks('![x](file:abc)', API)).toContain(BLOCKED_IMAGE_TEXT)
    expect(preprocessImageLinks('![x](file:1x)', API)).toContain(BLOCKED_IMAGE_TEXT)
  })

  it('围栏代码块内的图片语法不改写（示例代码保持原样）', () => {
    const md = '```md\n![x](file:999)\n```\n\n![y](file:1)'
    const out = preprocessImageLinks(md, API)
    expect(out).toContain('![x](file:999)')
    expect(out).toContain('![y](/api/files/1/raw)')
  })

  it('普通链接里的 [x](file:1) 不误伤（只处理图片语法）', () => {
    expect(preprocessImageLinks('[制度原文](file:1)', API)).toBe('[制度原文](file:1)')
  })

  it('8 种 mermaid 图表源码围栏不被图片预处理改写（§25 图表解析契约）', () => {
    // md-editor-v3 图表下拉插入的就是这些 ```mermaid 模板；kbPreviewMd 复用本函数，
    // 若误改围栏内的语法，图表会渲染失败并被当普通代码块（bash）显示。
    const charts = [
      'flowchart TD\n  Start --> Stop',
      'sequenceDiagram\n  A->>B: hello!',
      'gantt\ntitle Gantt Chart\ndateFormat YYYY-MM-DD',
      'classDiagram\n  class Animal',
      'stateDiagram-v2\n  s1 --> s2',
      'pie\n  "Dogs" : 386',
      'erDiagram\n  CAR ||--o{ NAMED-DRIVER : allows',
      'journey\n  title My Journey',
    ]
    for (const body of charts) {
      const md = `\`\`\`mermaid\n${body}\n\`\`\`\n\n![封面](file:7)`
      const out = preprocessImageLinks(md, API)
      expect(out).toContain('```mermaid')
      expect(out).toContain(body)
      expect(out).toContain('![封面](/api/files/7/raw)')
    }
  })
})

describe('renderMarkdown —— XSS 红线', () => {
  it('raw HTML 被转义，不产生可执行标签', () => {
    const html = renderMarkdown('# 标题\n\n<script>alert(1)</script>', { apiBase: API })
    expect(html).not.toContain('<script')
    expect(html).toContain('alert(1)')
  })

  it('内联 <img onerror> 被转义；onerror / srcset / style 属性不出现在结果里', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">', { apiBase: API })
    expect(html).not.toContain('<img')
    expect(html).toContain('alert(1)') // 内容保留为纯文本，而非可执行标签
    expect(html).not.toMatch(/<[^>]*\sonerror\s*=/i) // 不存在真实事件属性
  })

  it('javascript: / data: 链接被拒绝（markdown-it validateLink + DOMPurify 双保险）', () => {
    const html = renderMarkdown('[点我](javascript:alert(1))\n\n[点我](data:text/html,xxx)', {
      apiBase: API,
    })
    expect(html).not.toMatch(/href=["']?(?:javascript|data):/i)
    // markdown-it validateLink 拒绝非法协议后，整段链接语法原样留作纯文本
    expect(html).toContain('[点我](javascript:alert(1))')
    expect(html).toContain('[点我](data:text/html,xxx)')
  })

  it('合法图片渲染出的 src 只可能是 /api/files/<id>/raw', () => {
    const html = renderMarkdown('![流程图](file:42)', { apiBase: API })
    expect(html).toContain('src="/api/files/42/raw"')
    expect(html).not.toContain('file:42')
  })

  it('外链图片不会变成 <img src=https://...>', () => {
    const html = renderMarkdown('![x](https://evil.com/a.png)', { apiBase: API })
    expect(html).not.toContain('evil.com/a.png')
    expect(html).not.toContain('<img')
  })

  it('GFM 表格 / 代码块 / heading anchor 正常产出', () => {
    const html = renderMarkdown('## 报销制度\n\n| 项 | 值 |\n|---|---|\n| 限额 | 500 |\n\n```js\nconst a = 1\n```', {
      apiBase: API,
    })
    expect(html).toContain('<table>')
    expect(html).toContain('<code')
    expect(html).toContain('id="报销制度"')
  })

  it('重复标题 anchor 去重，与 extractHeadings 结果一致', () => {
    const md = '# 制度\n\n## 范围\n\n## 范围'
    const html = renderMarkdown(md, { apiBase: API })
    expect(html).toContain('id="范围"')
    expect(html).toContain('id="范围-1"')
    expect(extractHeadings(md).map((h) => h.anchor)).toEqual(['制度', '范围', '范围-1'])
  })
})

describe('collectFileRefs', () => {
  it('图片 + 普通链接都收集，去重且保序', () => {
    expect(collectFileRefs('![a](file:3)\n[b](file:9)\n![c](file:3)')).toEqual([3, 9])
  })
  it('非法引用不收集', () => {
    expect(collectFileRefs('![a](https://x.cn/a.png)\n[b](file:abc)')).toEqual([])
  })
})

describe('validateMarkdown —— 保存前规范校验', () => {
  it('合规文档零问题', () => {
    expect(validateMarkdown('# 制度\n\n## 范围\n\n### 细则\n\n正文')).toEqual([])
  })
  it('缺 H1 / 多个 H1 都报错', () => {
    expect(validateMarkdown('## 只有二级').some((i) => i.message.includes('H1'))).toBe(true)
    expect(validateMarkdown('# A\n\n# B').some((i) => i.message.includes('H1'))).toBe(true)
  })
  it('H1 直接跳 H3 报错，并带行号', () => {
    const issues = validateMarkdown('# 制度\n\n### 细则')
    expect(issues.some((i) => i.message.includes('H1 跳到 H3') && i.line === 3)).toBe(true)
  })
  it('代码块里的 # 不算标题', () => {
    expect(validateMarkdown('# 制度\n\n```\n# 这是注释\n### 也是注释\n```')).toEqual([])
  })
})
