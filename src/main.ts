import { createApp } from 'vue'
import { createPinia } from 'pinia'
// element-plus 按需引入（深层路径，绕开顶层入口 es/index.mjs）：
// 顶层入口静态 import 了全库组件的 index.mjs，而每个 index.mjs 都有
// `_Xxx.install = ...` 赋值副作用，rollup 判定有副作用不敢 tree-shaking，
// 结果 import 任何一个组件都会把整个 element-plus（JS+CSS 约 1MB）拖进首包，
// 弱网首屏干等 6s+。深层 import 每个组件只拉它自己的 src 依赖。
// 通知铃铛角标（AppHeader 头部）：未注册时 Vue 把 <el-badge> 当未解析组件，
// 整个子树（含铃铛按钮）渲染成注释节点——铃铛直接消失、控制台
// "Failed to resolve component: el-badge"（2026-10-20 虎哥截图实锤）。
import ElBadge from 'element-plus/es/components/badge/index.mjs'
import ElAlert from 'element-plus/es/components/alert/index.mjs'
// 流程定义页「配置节点」抽屉的可驳回列勾选（V43）：漏注册时 Vue 把
// <el-checkbox> 当未解析组件，该列渲染成注释节点、控制台
// "Failed to resolve component: el-checkbox"（2026-10-22 虎哥截图实锤）。
import ElCheckbox from 'element-plus/es/components/checkbox/index.mjs'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElCard from 'element-plus/es/components/card/index.mjs'
// ElConfigProvider：全局语言/尺寸等配置的提供者。本项目全程 deep-import，
// 没有 app.use(ElementPlus) 那一层默认 locale(zh-cn)，组件文案会回退英文
// （分页器显示 total / /page / Go to 的根因）。在 App.vue 根组件用它
// provide zh-cn，el-pagination 等内置文案即恢复中文。
// 注意：config-provider 是纯逻辑组件（只 provide context），无独立样式文件。
import ElConfigProvider from 'element-plus/es/components/config-provider/index.mjs'
// 帮助中心 FAQ 折叠（V32）：collapse / collapse-item 无独立包目录的 item 从入口具名导出
import ElCollapse, { ElCollapseItem } from 'element-plus/es/components/collapse/index.mjs'
// 问题反馈详情抽屉（V32）
import ElDrawer from 'element-plus/es/components/drawer/index.mjs'
// 审批进度时间线（2026-10-22 虎哥拍板：进度窗用时间线替代 Tab，立项/审批中心共用）。
// ElTimelineItem 没有独立包目录，从 timeline 入口具名导出（同 collapse-item 套路）；
// 漏注册时 Vue 把 <el-timeline> 当未知元素，进度弹窗只剩裸文字节点、
// 控制台 "Failed to resolve component: el-timeline"。
import ElTimeline, { ElTimelineItem } from 'element-plus/es/components/timeline/index.mjs'
// 注意：ElDescriptionsItem / ElFormItem 没有独立 index.mjs（子组件从父入口导出），
// 从 descriptions / form 的入口具名 import；该入口是叶节点，只拉自身 src 依赖。
import ElDescriptions, { ElDescriptionsItem } from 'element-plus/es/components/descriptions/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
// 知识库树节点「更多操作」三点菜单：ElDropdownMenu / ElDropdownItem 没有独立包目录，
// 从 dropdown 入口具名导出（同 collapse-item / table-column 套路）。漏注册时
// <el-dropdown> 被当未解析组件，整块菜单渲染成注释节点（同 el-badge 族坑）。
import ElDropdown, { ElDropdownMenu, ElDropdownItem } from 'element-plus/es/components/dropdown/index.mjs'
import ElEmpty from 'element-plus/es/components/empty/index.mjs'
import ElForm, { ElFormItem } from 'element-plus/es/components/form/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElInputNumber from 'element-plus/es/components/input-number/index.mjs'
// v-loading 指令（el-table 等组件的 loading 态）：ElLoading 插件 install 时
// app.directive('loading', vLoading)（官方 loading/index.ts 源码），不注册则
// 页面报 [Vue warn] Failed to resolve directive: loading。
import ElLoading from 'element-plus/es/components/loading/index.mjs'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
// 通知右下角轻提醒（SSE 推送时铃铛徽标之外的第二反馈，2026-10-20 虎哥要求）：
// 函数式 ElNotification(options) 调用前必须 app.use 注册（安装时注入 app context），
// 漏注册时调用会静默无弹窗（与 el-badge subtree 变注释节点同族的坑）
import ElNotification from 'element-plus/es/components/notification/index.mjs'
// ElPopover：菜单管理页「菜单图标」选择浮层（点击按钮弹出，省表单空间）。
// 未注册时 Vue 把 <el-popover> 当未知元素渲染——浮层内容直接内联摊进表单，
// 参考按钮被淹没、点选/回显交互全废（2026-10-14 虎哥截图实锤）。
// 内部由 ElTooltip 承载定位与箭头，tooltip 样式需一并引入。
import ElPopover from 'element-plus/es/components/popover/index.mjs'
// ElPopconfirm：AI 助手「最近会话」删除确认气泡（2026-11-22）。漏注册时
// <el-popconfirm> 被当未解析组件，#reference 插槽整个不渲染——删除 × 直接
// 从页面上消失、控制台 "Failed to resolve component: el-popconfirm"
// （同 el-badge / el-checkbox / el-timeline 族坑）。
import ElPopconfirm from 'element-plus/es/components/popconfirm/index.mjs'
// ElTooltip：超收标记的精致悬浮气泡（虎哥 2026-10-27 要求）。此前只引了 style/css 漏了
// 组件本体，导致 <el-tooltip> 运行时是未注册标签、气泡永不弹。popover 内部定位/箭头也复用它。
import ElTooltip from 'element-plus/es/components/tooltip/index.mjs'
// 分页器（字典数据页标准分页）：独立包目录，内部只依赖 icon（已注册）
import ElPagination from 'element-plus/es/components/pagination/index.mjs'
// ElOption 与 ElSelect 同入口具名导出（官方 select/index.ts：
// export const ElOption = withNoopInstall(Option)，与 menu-item 同套路）。
// 字典数据页的「样式」下拉用；样式 select/style/css 已随 tree-select 依赖引入过。
import ElSelect, { ElOption } from 'element-plus/es/components/select/index.mjs'
import ElRadio, { ElRadioGroup } from 'element-plus/es/components/radio/index.mjs'
import ElResult from 'element-plus/es/components/result/index.mjs'
import ElSwitch from 'element-plus/es/components/switch/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
// ElTableColumn 没有独立包目录，从 table 入口具名导出（与 menu-item 同套路）。
import ElTable, { ElTableColumn } from 'element-plus/es/components/table/index.mjs'
// ElTreeSelect 是独立包，但内部由 ElSelect + ElTree 组合渲染（官方 tree-select.vue），
// 见下方样式区对 select / tree 的补充说明。
// 注意：tree-select 内部自己 install 的是它 src 内部的 Tree 实例，不等于全局注册
// <el-tree> 标签——角色管理页「分配权限」弹窗直接用 <el-tree>，必须单独注册。
import ElTreeSelect from 'element-plus/es/components/tree-select/index.mjs'
import ElTree from 'element-plus/es/components/tree/index.mjs'
// 后台布局菜单：用 Element Plus 成熟组件 el-menu / el-sub-menu / el-menu-item，
// 不再手写递归菜单的样式与交互（激活态、折叠、层级缩进均由组件接管）。
// 注意：ElSubMenu / ElMenuItem 与 descriptions-item / form-item 同理，没有独立包目录
// （它们是 menu/src/ 下的子文件，es/components/ 下不存在 sub-menu/、menu-item/ 目录），
// JS 一律从 menu 入口具名导入，样式由 menu/style/css 统一聚合，勿手撕子路径。
import ElMenu, { ElSubMenu, ElMenuItem } from 'element-plus/es/components/menu/index.mjs'
// 个人中心页签（若依风格：基本资料 / 修改密码）
import ElTabs, { ElTabPane } from 'element-plus/es/components/tabs/index.mjs'
// 侧栏菜单滚动容器（成熟组件，折叠/展开时比原生 overflow 更顺滑）
import ElScrollbar from 'element-plus/es/components/scrollbar/index.mjs'
// 骨架屏（安装向导 / 系统重置页预检加载态）：漏注册时 <el-skeleton> 被当未知元素，
// 控制台 "Failed to resolve component: el-skeleton"（2026-10-21 虎哥截图实锤）。
// ElSkeletonItem 没有独立包目录的 install，从 skeleton 入口具名导出。
import ElSkeleton, { ElSkeletonItem } from 'element-plus/es/components/skeleton/index.mjs'
// 间距布局容器（模型配置弹窗内字段间距）：漏注册时 <el-space> 解析失败，
// 控制台报 "Failed to resolve component: el-space"，内部子元素退化为无样式裸渲染（2026-11-03 模型配置页实锤）。
import ElSpace from 'element-plus/es/components/space/index.mjs'
// 上传（文件列表页上传弹窗）：未注册时 <el-upload> 被当未知元素渲染——
// 拖拽区塌掉、点击/拖拽全失效、弹窗布局错乱（2026-10-16 虎哥截图实锤）。
import ElUpload from 'element-plus/es/components/upload/index.mjs'
// 日期选择器（登录/操作日志「时间区间」查询）：同理必须显式注册，
// 否则区间控件整个不渲染，查询栏只剩「时间区间」四个裸文字。
import ElDatePicker from 'element-plus/es/components/date-picker/index.mjs'
// 图片预览大图（RichView 展示端点击富文本内图片弹出）：漏注册时
// <el-image-viewer> 被当未知元素，点击图片无任何反应、控制台
// "Failed to resolve component: el-image-viewer"（同 el-badge 族坑）。
import ElImageViewer from 'element-plus/es/components/image-viewer/index.mjs'
// 图片缩略图 + 点击预览（发货详情签收证据，2026-10-23 虎哥：图片点击弹窗预览不跳新页）：
// el-image 的 preview 能力内部复用 ElImageViewer（上方已注册），此处只需注册 image 本体。
// 漏注册时 <el-image> 渲染成未知自定义元素，证据区只剩裸文件名。
import ElImage from 'element-plus/es/components/image/index.mjs'
// 栅格布局（协议管理页双栏：当前正文 14 / 版本历史 10）：
// row 和 col 是两个独立包目录（es/components/row、es/components/col），各自注册。
// 未注册时 Vue 把 <el-row>/<el-col> 当未知自定义元素渲染，控制台
// "Failed to resolve component" 警告且双栏布局塌成纵向堆叠（2026-10-19 实锤）。
import ElRow from 'element-plus/es/components/row/index.mjs'
import ElCol from 'element-plus/es/components/col/index.mjs'
// 与上方组件一一对应的样式（每个组件的 style/css 内部会带入 theme-chalk base 样式）
import 'element-plus/es/components/badge/style/css'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/checkbox/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/card/style/css'
import 'element-plus/es/components/descriptions/style/css'
import 'element-plus/es/components/descriptions-item/style/css'
import 'element-plus/es/components/dialog/style/css'
// 三点菜单：dropdown 负责触发与浮层定位（复用已引入的 tooltip/popper 样式），
// menu/item 各自的边框、分割线、hover 态样式在独立 style 包内，缺则菜单是裸文字。
import 'element-plus/es/components/dropdown/style/css'
import 'element-plus/es/components/dropdown-menu/style/css'
import 'element-plus/es/components/dropdown-item/style/css'
// el-dialog 的遮罩由 overlay 组件渲染（dialog.vue: import { ElOverlay } → <el-overlay :mask>），
// .el-overlay 的样式独立在 overlay 包内，dialog/style/css 不含它——
// 不引这一行，弹窗遮罩透明：没有暗背景、点不穿、z-index 缺失。
import 'element-plus/es/components/overlay/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/input-number/style/css'
import 'element-plus/es/components/loading/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/notification/style/css'
import 'element-plus/es/components/pagination/style/css'
import 'element-plus/es/components/popover/style/css'
import 'element-plus/es/components/popconfirm/style/css'
// popover 浮层由 ElTooltip 渲染（定位/箭头在 tooltip 包内），缺它浮层错位无箭头
import 'element-plus/es/components/tooltip/style/css'
import 'element-plus/es/components/radio/style/css'
// ⚠️ 上面的 radio/style/css 入口只聚合了 el-radio.css，漏掉 el-radio-group.css 与
// el-radio-button.css（element-plus 2.14 聚合入口的疏漏），必须单独补：
//   · 缺 el-radio-group.css  → 全站 15+ 处 el-radio-group 丢失 font-size / line-height 布局；
//   · 缺 el-radio-button.css  → el-radio-button 内原生 <input type=radio> 的隐藏样式（opacity:0）
//     失效，原生圆点裸露 + 连体边框/间距全丢，糊成一坨挤在一起的字（2026-11-18 实锤）。
import 'element-plus/theme-chalk/el-radio-group.css'
import 'element-plus/theme-chalk/el-radio-button.css'
import 'element-plus/es/components/result/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/tag/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/tree-select/style/css'
// tree-select 的下拉浮层由 ElSelect（el-select-dropdown）+ ElTree 组合渲染，
// 两者的样式分别在 select / tree 包内，tree-select/style/css 只有 popper 微调——
// 缺了这两行，父菜单下拉框与树节点样式全丢。
// （字典数据页的 el-select 直接复用这两行，无需重复引入）
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/tree/style/css'
import 'element-plus/es/components/menu/style/css'
import 'element-plus/es/components/tabs/style/css'
import 'element-plus/es/components/scrollbar/style/css'
// 骨架屏样式：skeleton 的 rows 占位块由 skeleton-item 渲染，其样式在 skeleton-item 包内，
// 缺这一行骨架条无灰底色（skeleton/style/css 只含容器布局）
import 'element-plus/es/components/skeleton/style/css'
import 'element-plus/es/components/skeleton-item/style/css'
import 'element-plus/es/components/upload/style/css'
// 日期选择器样式（下拉面板由 popper 定位，依赖 overlay 已引入）
import 'element-plus/es/components/date-picker/style/css'
// 图片预览大图样式（viewer 全屏遮罩 + 箭头/计数工具栏）
import 'element-plus/es/components/image-viewer/style/css'
// el-image 样式（缩略图容器、加载/错误占位、hover 放大镜提示）
import 'element-plus/es/components/image/style/css'
// 栅格 row/col 样式（col 的 width 百分比、row 的 flex/gutter 负 margin 都在这两个包内）
import 'element-plus/es/components/row/style/css'
import 'element-plus/es/components/col/style/css'
// 帮助中心折叠 + 反馈抽屉样式（V32；drawer 浮层同 dialog 依赖 overlay，已在上方引入）
import 'element-plus/es/components/collapse/style/css'
import 'element-plus/es/components/collapse-item/style/css'
import 'element-plus/es/components/drawer/style/css'
// 时间线样式（节点圆点/竖线/时间戳排版都在 timeline 包内）
import 'element-plus/es/components/timeline/style/css'
import '@/styles/reset.css'
import '@/styles/theme.css'
import '@/styles/pages.css'
import App from './App.vue'
import router from './router'
// 按钮级权限指令（任务3：v-has-perm）
import { registerHasPermDirective } from '@/directives/hasPerm'

const app = createApp(App)
app.use(createPinia())
app.use(router)
// 组件注册（ElMessage / ElMessageBox 为函数式组件，同样按需注册）
app.use(ElBadge)
app.use(ElAlert)
app.use(ElCheckbox)
app.use(ElButton)
app.use(ElCard)
app.use(ElConfigProvider)
// 帮助中心折叠 + 问题反馈抽屉（V32）
app.use(ElCollapse)
app.use(ElCollapseItem)
app.use(ElDrawer)
// 审批进度时间线（项目立项进度弹窗 + 审批中心，2026-10-22）
app.use(ElTimeline)
app.use(ElTimelineItem)
app.use(ElDescriptions)
app.use(ElDescriptionsItem)
app.use(ElDialog)
app.use(ElDropdown)
app.use(ElDropdownMenu)
app.use(ElDropdownItem)
app.use(ElEmpty)
app.use(ElForm)
app.use(ElFormItem)
app.use(ElIcon)
app.use(ElInput)
app.use(ElInputNumber)
app.use(ElLoading)
app.use(ElMessage)
app.use(ElMessageBox)
app.use(ElNotification)
app.use(ElPagination)
app.use(ElPopover)
app.use(ElPopconfirm)
app.use(ElTooltip)
app.use(ElSelect)
app.use(ElOption)
app.use(ElRadio)
app.use(ElRadioGroup)
app.use(ElResult)
app.use(ElSwitch)
app.use(ElTag)
app.use(ElTable)
app.use(ElTableColumn)
app.use(ElTreeSelect)
// 角色管理页分配权限弹窗的 <el-tree>（tree-select 不附带全局注册）
app.use(ElTree)
app.use(ElMenu)
app.use(ElSubMenu)
app.use(ElMenuItem)
// 栅格布局（协议管理页双栏）
app.use(ElRow)
app.use(ElCol)
app.use(ElTabs)
app.use(ElTabPane)
app.use(ElScrollbar)
// 骨架屏（安装向导 / 系统重置页预检加载态）
app.use(ElSkeleton)
app.use(ElSkeletonItem)
app.use(ElSpace)
app.use(ElUpload)
app.use(ElDatePicker)
// 图片预览大图（RichView 富文本图片点击预览）
app.use(ElImageViewer)
// 图片缩略图 + 点击预览（发货详情签收证据，2026-10-23）
app.use(ElImage)
// 按钮级权限指令：v-has-perm="'project:create'"（任务3）
registerHasPermDirective(app)

// ===== 全局异常兜底 =====
// 起因（2026-11-01 虎哥实测）：关闭参数保存接口权限后后端已返回 403，
// 前端却毫无提示——saveBasic 写的是 try{...}finally{...}，压根没有 catch，
// Promise rejection 变成 "Uncaught (in promise)" 只在控制台飘一行，
// 用户眼里就是「点了没反应」。本项目此前全站没有任何兜底
// （app.config.errorHandler 与 unhandledrejection 均为空）。
//
// 两张网各管一段，缺一不可：
//   ① app.config.errorHandler —— 模板渲染 / 生命周期 / 事件回调里的同步抛出
//   ② unhandledrejection      —— async 函数里没接住的 await 失败（本案元凶）
//
// 刻意吞异常的地方不受影响：它们已被 try/catch settle 掉，不会冒到这儿，
// 诸如 dashboard「网络失败不打断渲染」、登出容错、图片破图回落等降级逻辑照旧。
// 401 亦然：sessionGuard 的 hangSilently 返回永不 settle 的 Promise，不会 reject。
/** 框架/浏览器自身噪音，或用户主动中断，都不是故障 */
const NOISE_RE = /ResizeObserver loop|Script error\.?/i
const CANCEL_NAMES = new Set(['CanceledError', 'AbortError'])

/** 同一文案的去重窗口：并发请求同时失败时只弹一次，避免 toast 刷屏 */
const recentMsg = new Map<string, number>()

function reportError(reason: unknown) {
  if (reason == null) return
  const name = (reason as { name?: string } | null)?.name
  if (name && CANCEL_NAMES.has(name)) return // 请求取消 / 组件卸载导致的中止
  // 表单校验失败必须在这里拦掉：Element Plus 的 formRef.validate() reject 的是形如
  // { 字段名: [{ message, field }] } 的**纯对象**，没有 message 属性；此时表单项下方
  // 已有红字提示，若继续往下取文本会得到 "[object Object]" 的荒唐 toast。
  // 本项目有 10 处 await formRef.value.validate() 写在 try 之外，全靠这道闸。
  // 因此：只认「带 message 的错误」（request.ts 已把后端响应体的中文挂到 error.message），
  // 拿不到 message 的一律不打扰用户。
  const msg =
    typeof reason === 'string'
      ? reason
      : ((reason as { message?: string } | null)?.message ?? '')
  if (!msg || NOISE_RE.test(msg)) return

  const now = Date.now()
  if (now - (recentMsg.get(msg) ?? 0) < 1500) return
  if (recentMsg.size > 50) recentMsg.clear() // 长期运行防堆积
  recentMsg.set(msg, now)
  // request.ts 的响应拦截器已把后端响应体里的中文 message 挂到 error.message
  ElMessage({ message: msg, type: 'error', duration: 4500, showClose: true })
}

app.config.errorHandler = (err) => {
  console.error('[global] 组件内未捕获异常：', err)
  reportError(err)
}

window.addEventListener('unhandledrejection', (e) => {
  // 需要时用 preventDefault 抑制控制台的默认告警（已由上方 toast 接管）
  e.preventDefault()
  console.error('[global] 未处理的 Promise 拒绝：', e.reason)
  reportError(e.reason)
})

app.mount('#app')
