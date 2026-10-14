<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Fold,
  Expand,
  Menu as MenuIcon,
  FullScreen,
  ArrowDown,
  SwitchButton,
  User,
} from '@element-plus/icons-vue'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { useUserStore } from '@/stores/user'
import AppBreadcrumb from './AppBreadcrumb.vue'

// props 供模板直接按名使用（script 内不引用，故不接 const 绑定，避免 noUnusedLocals 误伤）
defineProps<{ collapsed: boolean; compact: boolean }>()
const emit = defineEmits<{ (e: 'toggle'): void }>()

const userStore = useUserStore()
const router = useRouter()

const nickname = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.username || '管理员'
)
// 头像占位：取昵称首字（后续可换真实头像 URL）
const initial = computed(() => (nickname.value || '管').slice(0, 1))

const userMenuOpen = ref(false)
function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value
}

function goProfile() {
  userMenuOpen.value = false
  router.push('/profile')
}

async function handleLogout() {
  userMenuOpen.value = false
  try {
    await ElMessageBox.confirm('确定要退出登录吗？', '退出确认', {
      type: 'warning',
      confirmButtonText: '退出登录',
      cancelButtonText: '取消',
    })
  } catch {
    return // 用户取消
  }
  await userStore.logout()
  ElMessage.success('已退出登录')
  router.push('/login')
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.()
  } else {
    document.exitFullscreen?.()
  }
}
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <button
        class="hamburger"
        type="button"
        :title="compact ? '菜单' : collapsed ? '展开侧栏' : '收起侧栏'"
        @click="emit('toggle')"
      >
        <el-icon :size="18">
          <component :is="compact ? MenuIcon : collapsed ? Expand : Fold" />
        </el-icon>
      </button>
      <!-- 面包屑置于 header（内容区一侧的左侧） -->
      <AppBreadcrumb />
    </div>

    <div class="header-right">
      <button class="icon-btn" type="button" title="全屏切换" @click="toggleFullscreen">
        <el-icon :size="16"><FullScreen /></el-icon>
      </button>

      <div class="user" @click="toggleUserMenu">
        <span class="avatar">{{ initial }}</span>
        <span class="uname">{{ nickname }}</span>
        <el-icon :size="14" class="caret"><ArrowDown /></el-icon>

        <div v-if="userMenuOpen" class="user-menu">
          <div class="user-menu-item" @click.stop="goProfile">
            <el-icon :size="15"><User /></el-icon>
            <span>个人中心</span>
          </div>
          <div class="user-menu-item" @click.stop="handleLogout">
            <el-icon :size="15"><SwitchButton /></el-icon>
            <span>退出登录</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 点击空白关闭用户菜单 -->
    <div v-if="userMenuOpen" class="user-menu-mask" @click="userMenuOpen = false" />
  </header>
</template>

<style scoped>
.app-header {
  height: var(--fs-header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  position: relative;
  z-index: 20;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.hamburger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: #515a6e;
  cursor: pointer;
  transition: background-color 0.15s;
}
.hamburger:hover {
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--fs-primary);
}
.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: #515a6e;
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s;
}
.icon-btn:hover {
  background: var(--el-fill-color-light, #f5f7fa);
  color: var(--fs-primary);
}
.user {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 4px;
  border-radius: 20px;
  cursor: pointer;
  transition: background-color 0.15s;
}
.user:hover {
  background: var(--el-fill-color-light, #f5f7fa);
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--el-color-primary-light-3, #a0cfff);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
}
.uname {
  font-size: 14px;
  color: #303133;
  max-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.caret {
  color: #909399;
}
.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 140px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  padding: 6px;
  z-index: 30;
}
.user-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  color: #303133;
  cursor: pointer;
}
.user-menu-item:hover {
  background: var(--el-color-primary-light-9, #ecf5ff);
  color: var(--fs-primary);
}
.user-menu-mask {
  position: fixed;
  inset: 0;
  z-index: 10;
}
</style>
