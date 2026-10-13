import { createApp } from 'vue'
import { createPinia } from 'pinia'
// element-plus 按需引入（深层路径，绕开顶层入口 es/index.mjs）：
// 顶层入口静态 import 了全库组件的 index.mjs，而每个 index.mjs 都有
// `_Xxx.install = ...` 赋值副作用，rollup 判定有副作用不敢 tree-shaking，
// 结果 import 任何一个组件都会把整个 element-plus（JS+CSS 约 1MB）拖进首包，
// 弱网首屏干等 6s+。深层 import 每个组件只拉它自己的 src 依赖。
import ElAlert from 'element-plus/es/components/alert/index.mjs'
import ElButton from 'element-plus/es/components/button/index.mjs'
import ElCard from 'element-plus/es/components/card/index.mjs'
// 注意：ElDescriptionsItem / ElFormItem 没有独立 index.mjs（子组件从父入口导出），
// 从 descriptions / form 的入口具名 import；该入口是叶节点，只拉自身 src 依赖。
import ElDescriptions, { ElDescriptionsItem } from 'element-plus/es/components/descriptions/index.mjs'
import ElForm, { ElFormItem } from 'element-plus/es/components/form/index.mjs'
import ElIcon from 'element-plus/es/components/icon/index.mjs'
import ElInput from 'element-plus/es/components/input/index.mjs'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import ElTag from 'element-plus/es/components/tag/index.mjs'
// 与上方组件一一对应的样式（每个组件的 style/css 内部会带入 theme-chalk base 样式）
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/card/style/css'
import 'element-plus/es/components/descriptions/style/css'
import 'element-plus/es/components/descriptions-item/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/tag/style/css'
import '@/styles/reset.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
// 组件注册（ElMessage / ElMessageBox 为函数式组件，同样按需注册）
app.use(ElAlert)
app.use(ElButton)
app.use(ElCard)
app.use(ElDescriptions)
app.use(ElDescriptionsItem)
app.use(ElForm)
app.use(ElFormItem)
app.use(ElIcon)
app.use(ElInput)
app.use(ElMessage)
app.use(ElMessageBox)
app.use(ElTag)
app.mount('#app')
