<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, reactive } from 'vue'
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

function go(path: string) {
  tabsStore.active = path
  router.push(path)
}

function closeTab(path: string, e: MouseEvent) {
  e.stopPropagation()
  if (path === AFFIX_TAB_PATH) return // 工作台固定页签不可关闭
  const wasActive = tabsStore.active === path
  tabsStore.close(path)
  // 关掉的是当前页 → 跳到新激活页（若有）
  if (wasActive && tabsStore.active) {
    router.push(tabsStore.active)
  } else if (wasActive && !tabsStore.active) {
    // 全部关完 → 回工作台
    router.push('/dashboard')
  }
}

// ===== 右键上下文菜单（参考 vue-element-admin TagsView：刷新/关闭当前/关闭其他/关闭左/右/全部）=====
const menu = reactive<{ visible: boolean; x: number; y: number; path: string }>({
  visible: false,
  x: 0,
  y: 0,
  path: '',
})

function openMenu(path: string, e: MouseEvent) {
  e.preventDefault()
  menu.path = path
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
  const p = menu.path
  const done = () => reload?.()
  // 先确保目标页为激活态，再强制重挂当前路由组件
  if (tabsStore.active !== p) router.push(p).finally(done)
  else done()
  closeMenu()
}
function onCloseCurrent() {
  closeTab(menu.path, new MouseEvent('click'))
  closeMenu()
}
function onCloseOthers() {
  tabsStore.closeOthers(menu.path)
  navToActive()
  closeMenu()
}
function onCloseLeft() {
  tabsStore.closeLeft(menu.path)
  navToActive()
  closeMenu()
}
function onCloseRight() {
  tabsStore.closeRight(menu.path)
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
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div v-if="tabsStore.tabs.length" class="tabs">
    <div
      v-for="t in tabsStore.tabs"
      :key="t.path"
      class="tab"
      :class="{ active: t.path === tabsStore.active }"
      @click="go(t.path)"
      @contextmenu.prevent="openMenu(t.path, $event)"
    >
      <span class="tab-title">{{ t.title }}</span>
      <span
        v-if="t.path !== AFFIX_TAB_PATH"
        class="tab-close"
        @click="closeTab(t.path, $event)"
        >×</span
      >
    </div>

    <!-- 右键浮层菜单（工作台为固定页签：不可关闭） -->
    <ul v-show="menu.visible" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <li @click="onRefresh"><el-icon><Refresh /></el-icon>刷新页面</li>
      <li
        :class="{ disabled: menu.path === AFFIX_TAB_PATH }"
        @click="menu.path !== AFFIX_TAB_PATH && onCloseCurrent()"
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
.tabs {
  position: relative;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  /* 左右留白与内容区左 padding 一致（--fs-content-padding=16px），页签左缘与正文对齐 */
  padding: 0 var(--fs-content-padding);
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  overflow-x: auto;
  flex-shrink: 0;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 4px;
  background: #fff;
  font-size: 12px;
  color: #606266;
  white-space: nowrap;
  cursor: pointer;
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
  font-size: 12px;
  line-height: 1;
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
