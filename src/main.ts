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
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElCard from 'element-plus/es/components/card/index.mjs'
// ElConfigProvider：全局语言/尺寸等配置的提供者。本项目全程 deep-import，
// 没有 app.use(ElementPlus) 那一层默认 locale(zh-cn)，组件文案会回退英文
// （分页器显示 total / /page / Go to 的根因）。在 App.vue 根组件用它
// provide zh-cn，el-pagination 等内置文案即恢复中文。
// 注意：config-provider 是纯逻辑组件（只 provide context），无独立样式文件。
import ElConfigProvider from 'element-plus/es/components/config-provider/index.mjs'
// 注意：ElDescriptionsItem / ElFormItem 没有独立 index.mjs（子组件从父入口导出），
// 从 descriptions / form 的入口具名 import；该入口是叶节点，只拉自身 src 依赖。
import ElDescriptions, { ElDescriptionsItem } from 'element-plus/es/components/descriptions/index.mjs'
import ElDialog from 'element-plus/es/components/dialog/index.mjs'
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
// 上传（文件列表页上传弹窗）：未注册时 <el-upload> 被当未知元素渲染——
// 拖拽区塌掉、点击/拖拽全失效、弹窗布局错乱（2026-10-16 虎哥截图实锤）。
import ElUpload from 'element-plus/es/components/upload/index.mjs'
// 日期选择器（登录/操作日志「时间区间」查询）：同理必须显式注册，
// 否则区间控件整个不渲染，查询栏只剩「时间区间」四个裸文字。
import ElDatePicker from 'element-plus/es/components/date-picker/index.mjs'
// 栅格布局（协议管理页双栏：当前正文 14 / 版本历史 10）：
// row 和 col 是两个独立包目录（es/components/row、es/components/col），各自注册。
// 未注册时 Vue 把 <el-row>/<el-col> 当未知自定义元素渲染，控制台
// "Failed to resolve component" 警告且双栏布局塌成纵向堆叠（2026-10-19 实锤）。
import ElRow from 'element-plus/es/components/row/index.mjs'
import ElCol from 'element-plus/es/components/col/index.mjs'
// 与上方组件一一对应的样式（每个组件的 style/css 内部会带入 theme-chalk base 样式）
import 'element-plus/es/components/badge/style/css'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/card/style/css'
import 'element-plus/es/components/descriptions/style/css'
import 'element-plus/es/components/descriptions-item/style/css'
import 'element-plus/es/components/dialog/style/css'
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
// popover 浮层由 ElTooltip 渲染（定位/箭头在 tooltip 包内），缺它浮层错位无箭头
import 'element-plus/es/components/tooltip/style/css'
import 'element-plus/es/components/radio/style/css'
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
import 'element-plus/es/components/upload/style/css'
import 'element-plus/es/components/date-picker/style/css'
// 栅格 row/col 样式（col 的 width 百分比、row 的 flex/gutter 负 margin 都在这两个包内）
import 'element-plus/es/components/row/style/css'
import 'element-plus/es/components/col/style/css'
import '@/styles/reset.css'
import '@/styles/theme.css'
import '@/styles/pages.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
// 组件注册（ElMessage / ElMessageBox 为函数式组件，同样按需注册）
app.use(ElBadge)
app.use(ElAlert)
app.use(ElButton)
app.use(ElCard)
app.use(ElConfigProvider)
app.use(ElDescriptions)
app.use(ElDescriptionsItem)
app.use(ElDialog)
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
app.use(ElUpload)
app.use(ElDatePicker)
app.mount('#app')
