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
  // ⑦ 连体伪表格（两种形态，均扣子 0 换行输出实锤）：
  //    a) 2026-11-22 f2f881c9：「|指标 |数值 || ---- | ---- ||累计…||」——|| 紧贴拼接；
  //    b) 2026-11-23 4970e028：「|累计回款 | | --- | --- | | PJ-… |80000.0元 |2.全周期…」
  //       ——行尾/行首竖线间带一个空格（| |），且表格嵌在编号列表项里、表格尾直接连正文结论句。
  //    以行为单位判定：只有「同一行内同时出现 GFM 分隔行特征与行间连体（|\s*|）」才处理。
  //    正常表格分隔行独占一行、不含 | | 连体（空单元格行也不与分隔行同行），永不命中；
  //    列间分隔竖线后是文字不是竖线，|\s*| 不命中列间——DeepSeek 等正常输出零影响。
  const SEP_ROW = /\|\s*:?-{2,}:?\s*\|/
  /** test 用（无 g，避免 lastIndex 状态漂移）；replace 用必须带 g（全部行间连体点都要拆） */
  const JOINED_TEST = /\|\s*\|/
  const JOINED_REPLACE = /\|\s*\|/g
  const isJoinedTableRow = (l: string) => SEP_ROW.test(l) && JOINED_TEST.test(l)
  if (seg.split('\n').some(isJoinedTableRow)) {
    seg = seg
      .split('\n')
      .map((l) => {
        if (!isJoinedTableRow(l)) return l
        // 行间拆行：行尾竖线与下一行行首竖线之间（无论有无空格）断行
        let rows = l.replace(JOINED_REPLACE, '|\n|').split('\n')
        const sepIdx = rows.findIndex((r) => SEP_ROW.test(r))
        if (sepIdx < 0) return rows.join('\n')
        // 表头行（分隔行上一行）前若有正文连写（如列表项「1.项目总数：…，项目详情： |项目编号…」）：
        // 在第一个竖线前断行，并补一个空行——空行让表格脱离段落/列表上下文成为块级元素，
        // 否则 CommonMark 把表格行当列表项的惰性续行，整表不渲染（4970e028 未渲染的第二根因）
        const header = rows[sepIdx - 1]
        const firstBar = header.indexOf('|')
        if (sepIdx > 0 && firstBar > 0) {
          rows[sepIdx - 1] = header.slice(0, firstBar).trimEnd() + '\n\n' + header.slice(firstBar)
          rows = rows.join('\n').split('\n')
        }
        // 表格尾正文连写（「|80000.0元 |2.全周期累计总回款金额：…」）：结论句直接拼在数据行尾，
        // 会被解析器并进末列截断丢失——在最后一个表格行尾竖线后断行 + 补空行
        const sepIdx2 = rows.findIndex((r) => SEP_ROW.test(r))
        let lastRow = -1
        for (let i = sepIdx2 + 1; i < rows.length; i++) {
          if (rows[i].trimStart().startsWith('|')) lastRow = i
          else break
        }
        if (lastRow > sepIdx2) {
          const row = rows[lastRow]
          const lastBar = row.lastIndexOf('|')
          const tail = row.slice(lastBar + 1).trim()
          if (tail) {
            rows[lastRow] = row.slice(0, lastBar + 1) + '\n\n' + tail
          }
        }
        return rows.join('\n')
      })
      .join('\n')
  }
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
