/**
 * 统一 Markdown 渲染管线（知识库正文预览 + AI 助手回答共用）
 *
 * 设计见 docs/知识库模块设计.md §3.4：
 *   1. 一条渲染管线，禁用 raw HTML；
 *   2. 图片协议白名单：只允许 file:<文件ID>，渲染时换内网签名 URL；
 *   3. heading 自动生成 anchor，作为切片与 AI 回答的出处跳转目标；
 *   4. 保存前校验「唯一 H1 / 标题不跳级」，保证 heading-aware 切片质量。
 *
 * ⚠️ 与参考项目 D:\FrontEnd\markdown 的关键分歧：那边 MarkdownPreview 用 rehype-raw
 *    「仅适用于可信内容」。知识库正文与 AI 输出都属**不可信文本**，允许 raw HTML
 *    等于开存储型 XSS 后门，这里反着做：markdown-it html:false + DOMPurify 双保险。
 *
 * 安全模型（三层，逐层收窄）：
 *   L1 markdown-it `html:false` —— 用户写的 <script>/<img onerror> 一律当纯文本转义；
 *   L2 preprocessImageLinks —— 图片语法只允许 ![alt](file:<数字>)，外链/data:/相对路径
 *      全部替换成可见占位文本（不静默破图，便于维护者发现）；
 *   L3 DOMPurify.sanitize —— 兜底拦 style/srcset/iframe 等，链接协议再拦一层。
 * 因此渲染结果里的 <img src> 只可能是本模块生成的 `${apiBase}/files/<id>/raw`，
 * 交给 RichView 同款 resolveImagesIn 用 JWT 拉 blob 即可，零外链、零 XSS 入口。
 */
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

/** 与 api/file.ts#fetchFileBlob、utils/richImage.ts 保持同源 */
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'

/** 被拦截图片的可见占位（不静默吞掉，让维护者知道正文里有非法引用） */
export const BLOCKED_IMAGE_TEXT = '图片已拦截（仅允许 file:<文件ID>）'

/** 图片语法：![alt](目标)，目标内不含空白与右括号；可选 title 一并吃掉 */
const IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const FILE_REF_RE = /^file:(\d+)$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/

// html:false 是安全基线，任何时候都不要为了"支持标签"打开它。
const mdIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
})

// heading anchor：保留中文（\p{L}\p{N}），重复标题追加 -1/-2，与 extractHeadings 同源
const slugSeen = new Map<string, number>()
function slugify(text: string, seen: Map<string, number>): string {
  const base =
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'section'
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return n === 0 ? base : `${base}-${n}`
}

mdIt.core.ruler.after('inline', 'kb_heading_anchor', (state) => {
  for (let i = 0; i < state.tokens.length; i++) {
    const open = state.tokens[i]
    if (open.type !== 'heading_open') continue
    const inline = state.tokens[i + 1]
    const text = inline?.children?.map((c) => c.content).join('') ?? ''
    open.attrSet('id', slugify(text, slugSeen))
  }
  return true
})

/**
 * 图片语法预处理：合法的 file:<id> 换成内网字节接口相对路径（后续由 resolveImagesIn
 * 带 JWT 拉 blob）；其它一律替换成占位文本。跳过围栏代码块，避免把示例代码误改。
 * 导出供单测直接验证协议白名单。
 */
export function preprocessImageLinks(md: string, apiBase = API_BASE): string {
  let inFence = false
  let fenceChar = ''
  return (md ?? '')
    .split('\n')
    .map((line) => {
      const fence = line.match(FENCE_RE)
      if (fence) {
        if (!inFence) {
          inFence = true
          fenceChar = fence[1][0]
        } else if (fence[1][0] === fenceChar) {
          inFence = false
          fenceChar = ''
        }
        return line
      }
      if (inFence) return line
      return line.replace(IMAGE_RE, (_match, alt: string, target: string) => {
        const m = target.match(FILE_REF_RE)
        if (m) return `![${alt}](${apiBase}/files/${m[1]}/raw)`
        return `\`[${BLOCKED_IMAGE_TEXT}：${alt || '未命名'}]\``
      })
    })
    .join('\n')
}

/** 渲染为可安全 v-html 的 HTML 字符串。知识库正文预览与 AI 回答都走这个函数。 */
export function renderMarkdown(md: string, opts: { apiBase?: string } = {}): string {
  const safeMd = preprocessImageLinks(md ?? '', opts.apiBase ?? API_BASE)
  slugSeen.clear()
  const rawHtml = mdIt.render(safeMd)
  // ⚠️ 必须包一层根 div 再消毒：happy-dom 的 fragment 解析会把「顶层首个 heading」
  //    标签丢掉但保留文本（实测 <h2>x</h2> → x，包 <div> 后完整保留）。生产浏览器
  //    无此问题，但根容器也是 v-html 更合理的挂载结构，顺带让单测与线上行为一致。
  const wrapped = `<div class="kb-md-body">${rawHtml}</div>`
  return DOMPurify.sanitize(wrapped, {
    ADD_ATTR: ['id'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset', 'style'],
  }) as string
}

/** 收集正文里所有 file:<id> 引用（图片 + 普通链接），供后端建立 sys_kb_attachment 关系 */
export function collectFileRefs(md: string): number[] {
  const ids = new Set<number>()
  const re = /\]\(file:(\d+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(md ?? ''))) ids.add(Number(m[1]))
  return [...ids]
}

export interface MdHeading {
  level: number
  text: string
  anchor: string
  line: number
}

/** 提取标题树（TOC / 切片 heading_path 用），anchor 与 renderMarkdown 生成的 id 一致 */
export function extractHeadings(md: string): MdHeading[] {
  const seen = new Map<string, number>()
  const out: MdHeading[] = []
  let inFence = false
  let fenceChar = ''
  ;(md ?? '')
    .split('\n')
    .forEach((line, idx) => {
      const fence = line.match(FENCE_RE)
      if (fence) {
        if (!inFence) {
          inFence = true
          fenceChar = fence[1][0]
        } else if (fence[1][0] === fenceChar) {
          inFence = false
          fenceChar = ''
        }
        return
      }
      if (inFence) return
      const h = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
      if (!h) return
      out.push({
        level: h[1].length,
        text: h[2],
        anchor: slugify(h[2], seen),
        line: idx + 1,
      })
    })
  return out
}

export interface MdIssue {
  line: number
  message: string
}

/**
 * 保存前 MD 规范校验（GitHub / GitLab / Obsidian 主线 + §3.3）：
 * 单文档唯一 H1、H2/H3 不跳级。跳级会让 heading-aware 切片丢上下文、出处锚点失效。
 */
export function validateMarkdown(md: string): MdIssue[] {
  const issues: MdIssue[] = []
  let h1 = 0
  let prevLevel = 0
  let inFence = false
  let fenceChar = ''
  ;(md ?? '')
    .split('\n')
    .forEach((line, idx) => {
      const fence = line.match(FENCE_RE)
      if (fence) {
        if (!inFence) {
          inFence = true
          fenceChar = fence[1][0]
        } else if (fence[1][0] === fenceChar) {
          inFence = false
          fenceChar = ''
        }
        return
      }
      if (inFence) return
      const h = line.match(/^(#{1,6})\s+/)
      if (!h) return
      const level = h[1].length
      if (level === 1) h1++
      if (prevLevel > 0 && level > prevLevel + 1) {
        issues.push({
          line: idx + 1,
          message: `标题从 H${prevLevel} 跳到 H${level}，请补齐中间层级`,
        })
      }
      prevLevel = level
    })
  if (h1 === 0) issues.push({ line: 0, message: '缺少唯一的 H1 标题（# 文档标题）' })
  else if (h1 > 1) issues.push({ line: 0, message: `存在 ${h1} 个 H1 标题，知识库要求唯一 H1` })
  return issues
}
