<script setup lang="ts">
import { inject, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  Refresh,
  Close,
  CircleClose,
  ArrowLeft,
  ArrowRight,
  CircleCloseFilled,
} from '@element-plus/icons-vue'
import { useTabsStore, AFFIX_TAB_PATH } from '@/stores/tabs'

const tabsStore = useTabsStore()
const router = useRouter()
// 由 AdminLayout provide：刷新当前页（key 变化强制重挂 router-view 组件），未提供则为 no-op
const reload = inject<() => void>('reload')

function go(fullPath: string) {
  tabsStore.active = fullPath
  router.push(fullPath)
}

function closeTab(fullPath: string, e: MouseEvent) {
  e.stopPropagation()
  if (fullPath === AFFIX_TAB_PATH) return // 工作台固定页签不可关闭
  const wasActive = tabsStore.active === fullPath
  tabsStore.close(fullPath)
  // 关掉的是当前页 → 跳到新激活页（若有）
  if (wasActive && tabsStore.active) {
    router.push(tabsStore.active)
  } else if (wasActive && !tabsStore.active) {
    // 全部关完 → 回工作台
    router.push('/dashboard')
  }
}

// ===== 右键上下文菜单（参考 vue-element-admin TagsView：刷新/关闭当前/关闭其他/关闭左/右/全部）=====
const menu = reactive<{ visible: boolean; x: number; y: number; fullPath: string }>({
  visible: false,
  x: 0,
  y: 0,
  fullPath: '',
})

function openMenu(fullPath: string, e: MouseEvent) {
  e.preventDefault()
  menu.fullPath = fullPath
  // 钳制到视口内，避免菜单超出屏幕（菜单 min-width 106px）
  menu.x = Math.min(e.clientX, window.innerWidth - 118)
  menu.y = Math.min(e.clientY, window.innerHeight - 200)
  menu.visible = true
}

function closeMenu() {
  menu.visible = false
}

function navToActive() {
  if (tabsStore.active) router.push(tabsStore.active)
  else router.push('/dashboard')
}

function onRefresh() {
  const p = menu.fullPath
  const done = () => reload?.()
  // 先确保目标页为激活态，再强制重挂当前路由组件
  if (tabsStore.active !== p) router.push(p).finally(done)
  else done()
  closeMenu()
}
function onCloseCurrent() {
  closeTab(menu.fullPath, new MouseEvent('click'))
  closeMenu()
}
function onCloseOthers() {
  tabsStore.closeOthers(menu.fullPath)
  navToActive()
  closeMenu()
}
function onCloseLeft() {
  tabsStore.closeLeft(menu.fullPath)
  navToActive()
  closeMenu()
}
function onCloseRight() {
  tabsStore.closeRight(menu.fullPath)
  navToActive()
  closeMenu()
}
function onCloseAll() {
  tabsStore.closeAll()
  router.push('/dashboard')
  closeMenu()
}

// 点击页面任意处关闭浮层
function onDocClick() {
  if (menu.visible) closeMenu()
}
// ===== 溢出平移：左右半透明箭头 + 按住拖拽（虎哥 2026-11-01 定方案）=====
// 前提：页签**始终留在 DOM 内不做折叠**，此处只读查询 scrollLeft/scrollWidth/clientWidth，
// 不改变任何子项的存在与否 → 不存在「测量 → 折叠 → 再测量」的递归抖动
// （2026-11-01 早前的 AntD Pro 折叠方案即死于此：页签脱离 DOM 后 offsetWidth 归零，阈值反复重算）。
const scroller = ref<HTMLElement | null>(null)
const canLeft = ref(false)
const canRight = ref(false)

function updateArrows() {
  const el = scroller.value
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  canLeft.value = el.scrollLeft > 1
  canRight.value = el.scrollLeft < max - 1
}

/** 点击箭头：一次平移约 60% 可视宽度 */
function scrollStep(dir: -1 | 1) {
  const el = scroller.value
  if (!el) return
  el.scrollBy({ left: dir * el.clientWidth * 0.6, behavior: 'smooth' })
}

// 按住拖拽：记录按下起点，横向位移直接换算成 scrollLeft
let dragPointerId: number | null = null
let dragStartX = 0
let dragStartLeft = 0
let dragMoved = false

function onDragStart(e: PointerEvent) {
  const el = scroller.value
  if (!el || el.scrollWidth <= el.clientWidth) return // 未溢出则无需拖拽
  if (e.button !== 0) return // 只响应左键，右键留给上下文菜单
  // 在关闭按钮上按下时不启动拖拽：否则拖动后松手的那次 click 会误关闭页签（closeTab 不经过 onTabClick）
  if ((e.target as HTMLElement | null)?.closest?.('.tab-close')) return
  dragPointerId = e.pointerId
  dragStartX = e.clientX
  dragStartLeft = el.scrollLeft
  dragMoved = false
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  const el = scroller.value
  if (dragPointerId === null || !el || e.pointerId !== dragPointerId) return
  const dx = e.clientX - dragStartX
  if (Math.abs(dx) > 3) dragMoved = true // 超过阈值才算拖拽，否则按点击处理
  if (dragMoved) {
    el.scrollLeft = dragStartLeft - dx
    e.preventDefault()
  }
}

function onDragEnd() {
  dragPointerId = null
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
}

/** 页签点击：刚发生过拖拽则吞掉这次 click，避免拖动时误切换页签 */
function onTabClick(fullPath: string) {
  if (dragMoved) {
    dragMoved = false
    return
  }
  go(fullPath)
}

let ro: ResizeObserver | null = null
watch(() => tabsStore.tabs.length, () => nextTick(updateArrows), { flush: 'post' })
onMounted(() => {
  // 点击页面任意处关闭右键浮层（与 onBeforeUnmount 里的 removeEventListener 必须成对出现；
  // 2026-11-01 本次结构改造时漏挂过一次，导致点击空白处菜单收不回去）
  document.addEventListener('click', onDocClick)
  nextTick(updateArrows)
  window.addEventListener('resize', updateArrows)
  if (typeof ResizeObserver !== 'undefined' && scroller.value) {
    // 容器宽度变化（侧栏折叠/窗口拉伸）→ 重算溢出状态
    ro = new ResizeObserver(updateArrows)
    ro.observe(scroller.value)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('resize', updateArrows)
  onDragEnd() // 兜底摘除可能残留的拖拽监听
  ro?.disconnect()
})
</script>

<template>
  <div v-if="tabsStore.tabs.length" class="tabs-bar">
    <!-- 左平移箭头：仅当左侧还有未显示内容时存在，hover 整个页签条才显形（见样式 .tabs-bar:hover） -->
    <div v-show="canLeft" class="tab-arrow left" title="向左滚动" @click="scrollStep(-1)">
      <el-icon :size="12"><ArrowLeft /></el-icon>
    </div>

    <!-- 滚动容器：overflow-x 保留（程序滚动 + 触控板横滑可用），原生滚动条已彻底隐藏 -->
    <div ref="scroller" class="tabs" @scroll="updateArrows" @pointerdown="onDragStart">
      <div
        v-for="t in tabsStore.tabs"
        :key="t.fullPath"
        class="tab"
        :class="{ active: t.fullPath === tabsStore.active }"
        @click="onTabClick(t.fullPath)"
        @contextmenu.prevent="openMenu(t.fullPath, $event)"
      >
        <span class="tab-title">{{ t.title }}</span>
        <span
          v-if="t.fullPath !== AFFIX_TAB_PATH"
          class="tab-close"
          @click="closeTab(t.fullPath, $event)"
        >
          <!-- 2026-10-23 虎哥反馈：文本 × 在不同浏览器倍率下垂直位置漂移（字体度量+亚像素取整所致），
               换 SVG 图标（Close）几何居中，与字体彻底脱钩 -->
          <el-icon :size="10"><Close /></el-icon>
        </span>
      </div>
    </div>

    <!-- 右平移箭头 -->
    <div v-show="canRight" class="tab-arrow right" title="向右滚动" @click="scrollStep(1)">
      <el-icon :size="12"><ArrowRight /></el-icon>
    </div>

    <!-- 右键浮层菜单（工作台为固定页签：不可关闭） -->
    <ul v-show="menu.visible" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <li @click="onRefresh"><el-icon><Refresh /></el-icon>刷新页面</li>
      <li
        :class="{ disabled: menu.fullPath === AFFIX_TAB_PATH }"
        @click="menu.fullPath !== AFFIX_TAB_PATH && onCloseCurrent()"
      >
        <el-icon><Close /></el-icon>关闭当前
      </li>
      <li @click="onCloseOthers"><el-icon><CircleClose /></el-icon>关闭其他</li>
      <li @click="onCloseLeft"><el-icon><ArrowLeft /></el-icon>关闭左侧</li>
      <li @click="onCloseRight"><el-icon><ArrowRight /></el-icon>关闭右侧</li>
      <li @click="onCloseAll"><el-icon><CircleCloseFilled /></el-icon>关闭全部</li>
    </ul>
  </div>
</template>

<style scoped>
/* 尺寸整体缩小一档（虎哥 2026-10-13：原规格显大）：
   条高 40→34、标签高 30→26、字号 13→12、内距/圆角/关闭钮同步收。
   EP 的 size 概念：default(32) → small(24)，这里是自定义标签取其中档。 */
/* 外层不滚动，只作定位容器 —— 箭头 absolute 锚在这一层，才不会跟着内容横向滚走 */
.tabs-bar {
  position: relative;
  display: flex;
  align-items: center;
  height: 34px;
  /* 左右留白与内容区左 padding 一致（--fs-content-padding=16px），页签左缘与正文对齐 */
  padding: 0 var(--fs-content-padding);
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  flex-shrink: 0;
}

/* 内层承担横向滚动。
   演进史（2026-11-01 虎哥）：原生滚动条太丑 → 试折叠「更多」→ 依赖 DOM 测量翻车（页签脱离 DOM
   后 offsetWidth 归零，阈值反复重算，没溢出也出「更多」）→ 改美化细滚动条 → 滚动条吃掉内容盒底部
   高度把页签挤上去还遮底边 → 最终采用 Ruoyi 流派：隐藏原生滚动条 + 左右箭头 + 按住拖拽。
   本层只读查询 scrollLeft/scrollWidth，**不改变任何子项的存在**，因此不存在递归重排风险。 */
.tabs {
  display: flex;
  /* 勿改回 center：横向滚动条会吃掉内容盒底部高度（34→30），center 在「当前可用高度」里重新居中
     → 页签上移 ~2px 且底边被滚动条压掉一截。用 flex-start 锚定顶部 + .tab 的 margin-top 静态还原居中。 */
  align-items: flex-start;
  gap: 4px;
  height: 34px;
  flex: 1;
  /* 关键：flex 子项默认 min-width:auto，不置 0 会被内容撑开 → 永远不溢出也就永远滚不动 */
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  /* 横向滚到边界不要把滚动传导给外层（避免整页跟着横向抖） */
  overscroll-behavior-x: contain;
  /* 原生滚动条彻底去掉：既不占布局高度，也不会压住页签；导航交给箭头与拖拽 */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* 旧版 Edge/IE */
}
.tabs::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

/* 左右平移箭头：哪端还有未显示内容哪端才存在（v-show 控制），
   默认透明，鼠标划过页签条才淡入；底衬半透明白色渐变，让被遮住的内容有渐隐感 */
.tab-arrow {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 宽度需盖住容器自带的 16px 左右内距，否则箭头会浮在第一个页签脸上 */
  width: 30px;
  color: #909399;
  cursor: pointer;
  opacity: 0;
  user-select: none;
  transition: opacity 0.2s, color 0.15s;
}
.tab-arrow.left {
  left: 0;
  background: linear-gradient(to right, rgba(255, 255, 255, 0.98) 45%, rgba(255, 255, 255, 0.5));
}
.tab-arrow.right {
  right: 0;
  background: linear-gradient(to left, rgba(255, 255, 255, 0.98) 45%, rgba(255, 255, 255, 0.5));
}
.tabs-bar:hover .tab-arrow {
  opacity: 1;
}
.tab-arrow:hover {
  color: var(--fs-primary, #409eff);
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  /* =(34-26)/2：静态还原原 center 的垂直居中效果，不参与运行时重算（见 .tabs 的 align-items 注释） */
  margin-top: 4px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  cursor: pointer;
  /* 关键：栏宽不足时 flex 默认会把子项压扁，页签会被挤变形、标题被截断。
     禁止收缩后页签保持自身宽度，超出部分交给 .tabs 的横向滚动。 */
  flex-shrink: 0;
  /* 2026-10-23 虎哥：禁用页签鼠标拖动选中（标题文字不可被选中拖蓝） */
  user-select: none;
  transition: all 0.15s;
}
.tab:hover {
  color: var(--fs-primary);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
}
.tab.active {
  color: var(--fs-primary);
  background: var(--el-color-primary-light-9, #ecf5ff);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
}
.tab-title {
  line-height: 1;
}
.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: #909399;
  transition: all 0.15s;
}
.tab-close:hover {
  background: var(--el-color-primary-light-5, #a0cfff);
  color: #fff;
}

/* 右键浮层菜单（参考 vue-element-admin TagsView，视觉与项目主色协调；
   宽度收窄：贴合四字文案，min-width 152→106） */
.ctx-menu {
  position: fixed;
  z-index: 3000;
  margin: 0;
  padding: 4px 0;
  list-style: none;
  min-width: 106px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);
  user-select: none;
}
.ctx-menu li {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
  color: #606266;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.15s;
}
.ctx-menu li:hover {
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--fs-primary);
}
.ctx-menu li.disabled {
  color: var(--el-text-color-placeholder, #c0c4cc);
  cursor: not-allowed;
}
.ctx-menu li.disabled:hover {
  background: transparent;
  color: var(--el-text-color-placeholder, #c0c4cc);
}
.ctx-menu .el-icon {
  font-size: 14px;
}
</style>
