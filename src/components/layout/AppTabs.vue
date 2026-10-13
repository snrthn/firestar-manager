<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useTabsStore } from '@/stores/tabs'

const tabsStore = useTabsStore()
const router = useRouter()

function go(path: string) {
  tabsStore.active = path
  router.push(path)
}

function close(path: string, e: MouseEvent) {
  e.stopPropagation()
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
</script>

<template>
  <div v-if="tabsStore.tabs.length" class="tabs">
    <div
      v-for="t in tabsStore.tabs"
      :key="t.path"
      class="tab"
      :class="{ active: t.path === tabsStore.active }"
      @click="go(t.path)"
    >
      <span class="tab-title">{{ t.title }}</span>
      <span
        v-if="tabsStore.tabs.length > 1"
        class="tab-close"
        @click="close(t.path, $event)"
        >×</span
      >
    </div>
  </div>
</template>

<style scoped>
/* 尺寸整体缩小一档（虎哥 2026-10-13：原规格显大）：
   条高 40→34、标签高 30→26、字号 13→12、内距/圆角/关闭钮同步收。
   EP 的 size 概念：default(32) → small(24)，这里是自定义标签取其中档。 */
.tabs {
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
</style>
