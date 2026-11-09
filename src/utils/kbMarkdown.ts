/**
 * 知识库 MD 渲染共享配置（编辑器内置预览 + 顶部「预览」tab 共用）
 *
 * 设计文档 §25：两个预览必须走**同一个渲染器**（md-editor-v3 MdPreview），
 * 才能彻底消除「系统预览 vs 默认预览」在 mermaid 图表上的表现差异。
 * 本模块是唯一的配置注入点，两个组件都 import 它（ESM 模块单例，只执行一次）。
 *
 * ⚠️ 为什么必须本地注入 mermaid 实例：
 *    md-editor-v3 v7 默认走 CDN `https://unpkg.com/mermaid@11.17.2/dist/mermaid.min.js`
 *    （lib/es/chunks/config.mjs:970/976），国内/内网实测不可达（curl 8s 超时）。
 *    组件源码 `let u = n.mermaid.instance; if (e.noMermaid || u) return;`
 *    （lib/es/chunks/index4.mjs:609/622）——传了 instance 就**直接跳过 CDN 加载**，
 *    且 config 合并时刻意排除含 Instance 的键以免深拷贝破坏实例。
 *    版本与默认 CDN 保持一致（11.17.2），避免 mermaid API 差异。
 */
import { config } from 'md-editor-v3'
import mermaid from 'mermaid'
import DOMPurify from 'dompurify'
import { preprocessImageLinks } from './markdown'

config({
  editorExtensions: {
    mermaid: { instance: mermaid },
  },
})

/**
 * 公式仍不启用：katex 同样依赖 unpkg CDN，且本轮需求只覆盖 8 种 mermaid 图表
 * （流程图 / 时序图 / 甘特图 / 类图 / 状态图 / 饼图 / 关系图 / 旅程图）。
 * 两端必须传同一个值，否则「编辑器能渲、系统预览不能渲」的不一致又会回来。
 */
export const KB_NO_KATEX = true

/**
 * 两端共用同一份 DOMPurify 兜底。md-editor-v3 自身已有 XSS 插件，这里是项目侧第二层。
 * 注意 sanitize 钩子拿到的是 markdown-it 渲染后的初始 HTML，mermaid 的 SVG 在之后
 * 异步生成（有独立的 sanitizeMermaid 严格清洗），所以 FORBID_TAGS style 不会误伤图表。
 */
export function kbSanitize(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['id'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'object', 'embed', 'link', 'meta', 'base'],
    FORBID_ATTR: ['srcset', 'style'],
  }) as string
}

/**
 * 图片协议白名单：合法的 ![alt](file:<id>) 换成内网字节接口相对路径
 * （随后由 resolveImagesIn 带 JWT 拉 blob），非法外链替换成可见占位文本。
 * preprocessImageLinks 会跳过围栏代码块，因此不会破坏 ```mermaid 图表源码。
 */
export function kbPreviewMd(md: string): string {
  return preprocessImageLinks(md ?? '')
}
