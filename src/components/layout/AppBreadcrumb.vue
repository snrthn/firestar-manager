<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

/**
 * 面包屑：取路由 matched 链上带 meta.title 的节点。
 * 首节点固定为「首页」，点击回根路由。
 */
const crumbs = computed(() =>
  route.matched
    .filter((r) => r.meta?.title)
    .map((r) => ({ title: r.meta.title as string, path: r.path }))
)
</script>

<template>
  <div class="breadcrumb">
    <span class="crumb root" @click="router.push('/')">首页</span>
    <template v-for="(c, i) in crumbs" :key="i">
      <span class="sep">/</span>
      <span
        class="crumb"
        :class="{ current: i === crumbs.length - 1 }"
        @click="i !== crumbs.length - 1 && router.push(c.path)"
      >
        {{ c.title }}
      </span>
    </template>
  </div>
</template>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  height: 36px;
  font-size: 13px;
  color: #909399;
  flex-shrink: 0;
}
.crumb {
  cursor: pointer;
  transition: color 0.15s;
}
.crumb:hover {
  color: var(--fs-primary);
}
.crumb.root {
  color: #606266;
}
.crumb.current {
  color: #303133;
  font-weight: 500;
  cursor: default;
}
.crumb.current:hover {
  color: #303133;
}
.sep {
  margin: 0 8px;
  color: #c0c4cc;
}
</style>
