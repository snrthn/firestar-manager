<script setup lang="ts">
import { provide, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useTabsStore } from '@/stores/tabs'
import { useBreakpoint } from '@/composables/useBreakpoint'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTabs from '@/components/layout/AppTabs.vue'

const appStore = useAppStore()
const tabsStore = useTabsStore()
const { isCompact } = useBreakpoint()
const route = useRoute()

// 页签右键「刷新当前页」：自增 reloadKey 强制 router-view 下的组件重新挂载。
// AdminLayout provide 出去，AppTabs 的「刷新」菜单项 inject 调用。
const reloadKey = ref(0)
function reload() {
  reloadKey.value++
}
provide('reload', reload)

// 紧凑模式下侧栏以抽屉呈现，drawerVisible 控制开合
const drawerVisible = ref(false)

function onToggle() {
  if (isCompact.value) {
    drawerVisible.value = !drawerVisible.value
  } else {
    appStore.sidebarCollapsed = !appStore.sidebarCollapsed
  }
}

// 路由变化即记录页签（AdminLayout 仅在已登录时挂载，不会收录 /login）
watch(
  () => route.fullPath,
  () => {
    tabsStore.add(route)
    // 窄屏抽屉：跳转发生后自动收起（点菜单项 → router.push → 路由变化 → 关抽屉）。
    // 注意关闭只能挂路由变化/遮罩点击，不能挂抽屉容器自身的 click——
    // 那样在抽屉里点 el-sub-menu 展开收起、滚动等任何交互都会冒泡误关抽屉。
    if (isCompact.value) drawerVisible.value = false
  },
  { immediate: true }
)
</script>

<template>
  <div class="admin-layout">
    <!-- 桌面：左侧通顶侧栏（100dvh 独立列，不在 header 之下） -->
    <AppSidebar
      v-if="!isCompact"
      class="sidebar-desktop"
      :collapsed="appStore.sidebarCollapsed"
    />

    <!-- 右侧：header（内容区一侧，含面包屑）+ 内容区 -->
    <div class="body">
      <AppHeader
        :collapsed="appStore.sidebarCollapsed"
        :compact="isCompact"
        @toggle="onToggle"
      />

      <main class="content">
        <AppTabs />
        <div class="view-wrap">
          <router-view v-slot="{ Component }">
            <component :is="Component" :key="reloadKey" />
          </router-view>
        </div>
      </main>
    </div>

    <!-- 紧凑：遮罩 + 抽屉侧栏 -->
    <div
      v-if="isCompact"
      class="drawer-mask"
      :class="{ show: drawerVisible }"
      @click="drawerVisible = false"
    />
    <!-- 抽屉容器自身不绑 click 关闭：菜单的 sub-menu 展开收起等交互会冒泡上来，
         误触关闭（虎哥 2026-10-13 实测）。关闭只留两个口子：点遮罩 + 路由跳转。 -->
    <aside
      v-if="isCompact"
      class="drawer"
      :class="{ show: drawerVisible }"
    >
      <AppSidebar :collapsed="false" />
    </aside>
  </div>
</template>

<style scoped>
.admin-layout {
  /* dvh：动态视口高度，移动端浏览器地址栏收放时不会按 100vh 算出
     「比可视区高一截」的高度而意外出现滚动条；老浏览器不支持 dvh，
     由上一行 100vh 兜底（级联覆盖，支持 dvh 的用后者）。 */
  height: 100vh;
  height: 100dvh;
  display: flex;
  background: var(--fs-layout-bg, #f5f7fa);
  overflow: hidden;
}
.sidebar-desktop {
  flex-shrink: 0;
  height: 100%;
}
.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.view-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--fs-content-padding);
}

/* 抽屉（紧凑模式） */
.drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease;
  z-index: 40;
}
.drawer-mask.show {
  opacity: 1;
  visibility: visible;
}
.drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: var(--fs-sidebar-width);
  background: #fff;
  transform: translateX(-100%);
  transition: transform 0.2s ease;
  z-index: 41;
  box-shadow: 2px 0 12px rgba(0, 0, 0, 0.15);
}
.drawer.show {
  transform: translateX(0);
}
</style>
