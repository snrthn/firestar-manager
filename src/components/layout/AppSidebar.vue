<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import SidebarNode from './SidebarNode.vue'

defineProps<{ collapsed: boolean }>()

const userStore = useUserStore()
const appStore = useAppStore()
const route = useRoute()

// 侧栏消费展示集（visible 过滤后的）；可访问全集在 userStore.menus，供路由同步用
const menus = computed(() => userStore.visibleMenus)
// 当前路由 path 作为 el-menu 高亮项（与 el-menu-item 的 index=routePath 精确匹配）
const activePath = computed(() => route.path)
</script>

<template>
  <aside class="app-sidebar" :class="{ collapsed }">
    <!-- 侧栏通顶：顶部 logo 条。
         虎哥 2026-10-21：参数配置里填了 logo_url 就优先用链接显示图片（折叠态也留小图）；
         未配置或图片加载失败（坏链/跨域拒绝）时回落「火」字块 + 系统名 -->
    <div class="logo">
      <template v-if="appStore.logoUrl">
        <img
          :src="appStore.logoUrl"
          class="logo-img"
          :class="{ 'logo-img-sm': collapsed }"
          :alt="appStore.title"
          @error="appStore.markLogoBroken()"
        />
        <span v-if="!collapsed" class="logo-text">{{ appStore.title }}</span>
      </template>
      <template v-else>
        <span class="logo-mark">火</span>
        <span v-if="!collapsed" class="logo-text">{{ appStore.title }}</span>
      </template>
    </div>

    <!-- 菜单区：el-menu 接管激活/折叠/层级，el-scrollbar 负责滚动 -->
    <el-scrollbar class="menu-scroll">
      <el-menu
        :default-active="activePath"
        :collapse="collapsed"
        :collapse-transition="false"
        router
        class="app-el-menu"
      >
        <SidebarNode v-for="m in menus" :key="m.id" :node="m" />
      </el-menu>
    </el-scrollbar>
  </aside>
</template>

<style scoped>
.app-sidebar {
  height: 100%;
  width: var(--fs-sidebar-width);
  background: #fff;
  border-right: 1px solid var(--el-border-color-lighter, #ebeef5);
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  transition: width 0.2s ease;
}
.app-sidebar.collapsed {
  width: var(--fs-sidebar-collapsed-width);
}
.logo {
  height: var(--fs-header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid #f9f9f9;
  overflow: hidden;
}
.logo-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--fs-primary);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  flex-shrink: 0;
}
/* 自定义 Logo：contain 保持比例不裁切，30px 与「火」字块同高 */
.logo-img {
  height: 30px;
  max-width: 120px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 6px;
}
/* 折叠态收窄，避免长图把侧栏撑宽 */
.logo-img-sm {
  max-width: 30px;
}
.logo-text {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  white-space: nowrap;
  overflow: hidden;
}
.menu-scroll {
  flex: 1;
  min-height: 0;
}
/* 去掉 el-menu 默认右边框（侧栏已统一描边），并让菜单占满宽度 */
.app-el-menu {
  border-right: none;
}
</style>
