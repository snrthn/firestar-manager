/**
 * AI 回答正文的兜底清洗（DSML 伪工具调用噪声 + 扣子无换行伪 Markdown）。
 *
 * 背景：实测 DeepSeek 会把 tool call 以 `<|DSML|>` 文本塞进 content，旧会话已原样落库。
 * 后端已在 SSE token 出口做跨帧剥离（DsmlTokenFilter），本层负责：
 *   ① 回放历史脏数据；② 运行期切换模型后模型再次吐协议标记的兜底。
 *
 * 背景 ②（2026-11-22 实锤）：扣子侧模型输出「无换行的内联伪 Markdown」——679 字 0 换行、
 * `###1.标题正文连写`、`；-列表项不换行`。后端 CozeProvider 已在注入指令里加了输出格式
 * 规范，但历史脏数据与模型不听话时仍会漏出，本层把内联伪标记恢复成合法 Markdown 结构。
 *
 * 设计取舍：
 *   - DSML 部分按行过滤，不动正常 markdown 结构（含 GFM 表格分隔行 `|---|`）；
 *   - 伪 Markdown 规范化只命中「标记与正文连写」的内联位置，合法 Markdown（标记后
 *     已有空格、列表项已独占一行）不会被改动，因此对 DeepSeek 等正常输出零影响；
 *   - 围栏代码块（``` 包裹段）整体跳过，避免误伤代码内容。
 * 调用方保留 raw content（审计/原文），只把清洗后的文本用于渲染、复制与下载（口径一致）。
 */
const DSML_MARK = /<\s*\/?\s*\|+\s*DSML/i
/** 被过滤标记行之后残留的纯标签尾巴：parameter> / invoke> / calls> */
const TAG_TAIL = /^\s*(?:parameter|invoke|calls)\s*>\s*$/i

/**
 * 内联伪 Markdown → 合法 Markdown 的恢复规则（按命中风险从低到高排列）。
 * 只处理「标记与前后文连写」的位置；已是合法结构的文本不会被任何规则命中。
 */
function normalizeSegment(seg: string): string {
  return seg
    // ① 行内伪标题（##~######，不含单个 #——防误伤「C#」「话题标签」）：
    //    「：###1.标题正文」→「：\n\n### 1.标题正文」（断行 + 标记后补空格）
    .replace(/([^\n#])(#{2,6})(?=[^\s#])/g, '$1\n\n$2 ')
    // ② 行首标题缺空格：「###标题」→「### 标题」
    .replace(/(^|\n)(#{1,6})(?=[^\s#])/g, '$1$2 ')
    // ③ 行内伪无序列表：标点后紧跟「-正文」→ 断行 + 补空格（「；-最常用的是」→「；\n- 最常用的是」）
    //    前面限定中文/英文标点，不误伤「10-20」「2020-2021」这类数字区间
    .replace(/([；。：，,;:）)】」》”])(-)(?=[^\s-])/g, '$1\n$2 ')
    // ④ 行首列表项缺空格：「-正文」→「- 正文」（--- 水平线因 (?![^\s-]) 排除不受影响）
    .replace(/(^|\n)-(?=[^\s-])/g, '$1- ')
    // ⑤ 行内伪有序列表：标点后紧跟「1.正文」→ 断行 + 补空格（「。1.重置密码」→「。\n1. 重置密码」）
    //    句点后必须非数字非空白，避免误伤「3.14」「v1.2」
    .replace(/([；。：，,;:）)】」》”])(\d{1,2})\.(?=[^\d\s])/g, '$1\n$2. ')
    // ⑥ 行首有序列表缺空格：「1.正文」→「1. 正文」（「2024.11」句点后是数字，排除）
    .replace(/(^|\n)(\d{1,9})\.(?=[^\d\s.])/g, '$1$2. ')
}

/** 围栏代码块外的正文做规范化，代码块本体原样保留（split 后奇数下标是代码块） */
export function normalizeAiMarkdown(raw: string): string {
  if (!raw) return raw
  return raw
    .split('```')
    .map((seg, i) => (i % 2 === 1 ? seg : normalizeSegment(seg)))
    .join('```')
}

export function cleanAiMarkdown(raw: string): string {
  if (!raw) return raw
  const lines = raw.split('\n').filter((line) => !DSML_MARK.test(line) && !TAG_TAIL.test(line))
  return normalizeAiMarkdown(
    lines
      .join('\n')
      // 整行删掉（连同前导换行），不能只清空内容留个空行
      .replace(/\n[ \t]*(?:\|[ \t]*){2,}(?=\n|$)/g, '')
      .replace(/\n{3,}/g, '\n\n'),
  )
    // 去掉末尾空白：让「复制回答 / 下载 .md」拿到的文本不带模型常附的尾部空行。
    // 注：remark 对末尾 \n\n 不会产生空段落，所以这一步不解决操作栏间距问题。
    .trimEnd()
}
