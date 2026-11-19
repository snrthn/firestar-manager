/**
 * AI 回答正文的兜底清洗（DSML 伪工具调用噪声）。
 *
 * 背景：实测 DeepSeek 会把 tool call 以 `<|DSML|>` 文本塞进 content，旧会话已原样落库。
 * 后端已在 SSE token 出口做跨帧剥离（DsmlTokenFilter），本层负责：
 *   ① 回放历史脏数据；② 运行期切换模型后模型再次吐协议标记的兜底。
 *
 * 设计取舍：按行过滤，不动正常 markdown 结构（含 GFM 表格分隔行 `|---|`）。
 * 调用方保留 raw content（审计/原文），只把清洗后的文本用于渲染、复制与下载。
 */
const DSML_MARK = /<\s*\/?\s*\|+\s*DSML/i
/** 被过滤标记行之后残留的纯标签尾巴：parameter> / invoke> / calls> */
const TAG_TAIL = /^\s*(?:parameter|invoke|calls)\s*>\s*$/i
export function cleanAiMarkdown(raw: string): string {
  if (!raw) return raw
  const lines = raw.split('\n').filter((line) => !DSML_MARK.test(line) && !TAG_TAIL.test(line))
  return lines
    .join('\n')
    // 整行删掉（连同前导换行），不能只清空内容留个空行
    .replace(/\n[ \t]*(?:\|[ \t]*){2,}(?=\n|$)/g, '')
    .replace(/\n{3,}/g, '\n\n')
    // 去掉末尾空白：让「复制回答 / 下载 .md」拿到的文本不带模型常附的尾部空行。
    // 注：remark 对末尾 \n\n 不会产生空段落，所以这一步不解决操作栏间距问题。
    .trimEnd()
}
