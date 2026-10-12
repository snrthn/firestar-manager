<script setup lang="ts">
// 临时设计审计入口 —— 对外公开监督用途。
// 正式上线后移除清单：
//   1) 删除本组件文件
//   2) 删除 App.vue 中的 <DesignAuditEntry />
//   3) 删除 public/design-audit/ 整个目录（含需求文档 html 副本）
const openAudit = () => {
  // 组装页位于 public/design-audit/index.html，基于 BASE_URL 拼接以兼容子路径部署
  window.open(import.meta.env.BASE_URL + 'design-audit/index.html', '_blank')
}
</script>

<template>
  <!-- 临时：设计审计悬浮入口，正式上线后移除 -->
  <div
    class="design-audit-entry"
    @click="openAudit"
    title="项目规划与设计文档（临时入口）"
  >
    <span class="dot"></span>
    <span class="label">文档</span>
  </div>
</template>

<style scoped>
.design-audit-entry {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 9999;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: #2563eb;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  border-radius: 24px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
  user-select: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.design-audit-entry:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
}
.design-audit-entry .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
}
</style>
