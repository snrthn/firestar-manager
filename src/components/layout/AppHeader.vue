<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  Fold,
  Expand,
  Menu as MenuIcon,
  FullScreen,
  ArrowDown,
  SwitchButton,
  User,
  InfoFilled,
  Bell,
  QuestionFilled,
  ChatDotRound,
} from '@element-plus/icons-vue'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useNotifyStore } from '@/stores/notify'
import { getAbout } from '@/api/config'
import AppBreadcrumb from './AppBreadcrumb.vue'
import RichView from '@/components/RichView.vue'
import { useAvatar } from '@/composables/useAvatar'
import type { NotificationVO } from '@/types/notification'

// props 供模板直接按名使用（script 内不引用，故不接 const 绑定，避免 noUnusedLocals 误伤）
defineProps<{ collapsed: boolean; compact: boolean }>()
const emit = defineEmits<{ (e: 'toggle'): void }>()

const userStore = useUserStore()
const router = useRouter()
const notify = useNotifyStore()

// 登录后立即拉一次未读数（SSE 重连后的校正由 realtimeClient 侧调用 store.refreshUnread）
onMounted(() => {
  notify.init()
})

const nickname = computed(
  () => userStore.userInfo?.nickname || userStore.userInfo?.username || '管理员'
)
// 头像占位：取昵称首字（有真实头像图时优先显示图，见模板）
const initial = computed(() => (nickname.value || '管').slice(0, 1))
// 真实头像：后端存 sys_file_storage.id，经 useAvatar 解析为可渲染地址（OSS 直连 / 本地 blob）
const avatarSrc = useAvatar(computed(() => userStore.userInfo?.avatarUrl))

const userMenuOpen = ref(false)
function toggleUserMenu() {
  userMenuOpen.value = !userMenuOpen.value
}

function goProfile() {
  userMenuOpen.value = false
  router.push('/profile')
}

// 帮助中心 / 问题反馈（V32，虎哥 2026-10-21 拍板：帮助中心挪到 header 图标区
// （铃铛与全屏之间）；问题反馈留在头像下拉。均为隐藏菜单 + 路由跳页，
// 问题反馈页挂载了 window.__feedbackRefresh 钩子做 SSE 联动刷新）
function goHelp() {
  userMenuOpen.value = false
  router.push('/help')
}

function goFeedback() {
  userMenuOpen.value = false
  router.push('/system/feedback')
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

// ===== 通知铃铛（用户侧全登录功能，不走系统管理菜单，见 P2 方案 4.4） =====
function onNotifyScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
    notify.loadMore()
  }
}

/** 点击某条：先标记已读（接口成功才动本地态），再弹详情看正文；有链接走「查看详情」跳转 */
async function onNotifyClick(n: NotificationVO) {
  const ok = await notify.readOne(n.id)
  if (!ok) return
  detailItem.value = n
  detailVisible.value = true
}

/** 详情弹窗内跳转：站内相对路径走 router，http(s):// 外链新标签打开（2026-10-20 虎哥要求双支持）。
 *  无 linkUrl 的通知兜底跳问题反馈页（2026-10-21 虎哥要求：详情弹窗必给「查看详情」出口） */
function goDetailLink() {
  const link = detailItem.value?.linkUrl || '/system/feedback'
  detailVisible.value = false
  notify.closePanel()
  if (link.startsWith('/')) {
    router.push(link)
  } else {
    window.open(link, '_blank')
  }
}

// ===== 通知详情弹窗（点击面板条目弹出正文，2026-10-20 虎哥要求：不能一点就只剩已读） =====
const detailVisible = ref(false)
const detailItem = ref<NotificationVO | null>(null)

/** 通知时间：今天 → HH:mm；本年 → MM-DD；跨年 → YYYY-MM-DD */
function formatNotifyTime(ts: string): string {
  if (!ts) return ''
  const d = new Date(ts.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ts
  const now = new Date()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  if (d.toDateString() === now.toDateString()) return `${hh}:${mm}`
  const sameYear = d.getFullYear() === now.getFullYear()
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  const DD = String(d.getDate()).padStart(2, '0')
  return sameYear ? `${MM}-${DD}` : `${d.getFullYear()}-${MM}-${DD}`
}

// ===== 关于我们弹窗（数据来自 /system/config/about，登录即可访问） =====
const aboutVisible = ref(false)
const aboutLoading = ref(false)
const aboutData = reactive<{
  systemName: string
  icpNo: string
  supportContact: string
  aboutUs: string
  appVersion: string
}>({
  systemName: '',
  icpNo: '',
  supportContact: '',
  aboutUs: '',
  appVersion: '',
})

// 弹窗标题：关于我们 - {系统名}
const aboutTitle = computed(() => `关于我们 - ${aboutData.systemName || '火星财务'}`)

async function openAbout() {
  userMenuOpen.value = false
  aboutVisible.value = true
  aboutLoading.value = true
  try {
    const d = await getAbout()
    Object.assign(aboutData, d)
  } catch {
    ElMessage.error('加载关于信息失败')
  } finally {
    aboutLoading.value = false
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
      <!-- 通知铃铛：用户侧功能，无权限点（2026-10-23 虎哥：调到帮助前面，铃铛点击频次高、
           原顺序容易误点帮助图标） -->
      <el-badge
        :value="notify.unreadCount"
        :max="99"
        :hidden="notify.unreadCount === 0"
        class="notify-badge"
      >
        <button class="icon-btn" type="button" title="通知" @click="notify.openPanel()">
          <el-icon :size="16"><Bell /></el-icon>
        </button>
      </el-badge>

      <!-- 帮助中心：铃铛之后（2026-10-23 调换，原 V32 顺序为帮助在前） -->
      <button class="icon-btn" type="button" title="帮助中心" @click="goHelp">
        <el-icon :size="16"><QuestionFilled /></el-icon>
      </button>

      <button class="icon-btn" type="button" title="全屏切换" @click="toggleFullscreen">
        <el-icon :size="16"><FullScreen /></el-icon>
      </button>

      <div class="user" @click="toggleUserMenu">
        <img v-if="avatarSrc" :src="avatarSrc" class="avatar-img" :alt="nickname" />
        <span v-else class="avatar">{{ initial }}</span>
        <span class="uname">{{ nickname }}</span>
        <el-icon :size="14" class="caret"><ArrowDown /></el-icon>

        <div v-if="userMenuOpen" class="user-menu">
          <div class="user-menu-item" @click.stop="goProfile">
            <el-icon :size="15"><User /></el-icon>
            <span>个人中心</span>
          </div>
          <div class="user-menu-item" @click.stop="goFeedback">
            <el-icon :size="15"><ChatDotRound /></el-icon>
            <span>问题反馈</span>
          </div>
          <div class="user-menu-item" @click.stop="openAbout">
            <el-icon :size="15"><InfoFilled /></el-icon>
            <span>关于我们</span>
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

    <!-- 通知面板：不分 Tab、不做独立页（P2 方案 4.1/10.5 收窄） -->
    <div v-if="notify.panelOpen" class="notify-mask" @click="notify.closePanel()" />
    <div v-if="notify.panelOpen" class="notify-panel">
      <div class="notify-panel-head">
        <span class="notify-panel-title">通知</span>
        <el-button
          v-if="notify.unreadCount > 0"
          link
          type="primary"
          size="small"
          @click="notify.readAll()"
        >
          全部已读
        </el-button>
      </div>
      <div class="notify-list" @scroll="onNotifyScroll">
        <div
          v-for="n in notify.items"
          :key="n.id"
          class="notify-item"
          :class="{ unread: !n.read }"
          @click="onNotifyClick(n)"
        >
          <div class="notify-item-title">
            <span v-if="!n.read" class="notify-dot" />
            <span class="notify-item-text">{{ n.title }}</span>
          </div>
          <div class="notify-item-time">{{ formatNotifyTime(n.createdAt) }}</div>
        </div>
        <div v-if="notify.loading" class="notify-empty">加载中…</div>
        <div v-else-if="notify.loadedAll && notify.items.length > 0" class="notify-empty">
          已加载全部
        </div>
        <div v-else-if="notify.items.length === 0" class="notify-empty">暂无通知</div>
      </div>
    </div>
  </header>

  <!-- 关于我们弹窗 -->
  <el-dialog v-model="aboutVisible" :title="aboutTitle" width="480px" append-to-body>
    <div v-loading="aboutLoading" class="about-body">
      <div class="about-meta">
        <p v-if="aboutData.supportContact" class="about-row">
          技术支持：{{ aboutData.supportContact }}
        </p>
        <p v-if="aboutData.appVersion" class="about-row">版本：{{ aboutData.appVersion }}</p>
      </div>
      <p v-if="aboutData.icpNo" class="about-row">ICP 备案号：{{ aboutData.icpNo }}</p>
      <RichView v-if="aboutData.aboutUs" :html="aboutData.aboutUs" class="about-notice" />
    </div>
    <template #footer>
      <el-button type="primary" @click="aboutVisible = false">知道了</el-button>
    </template>
  </el-dialog>

  <!-- 通知详情弹窗：标题栏只保留「通知详情」，不再拼接通知标题
       （2026-10-21 虎哥要求移除拼接——原标题栏/内容区/正文首行三处重复同一文本，
       数字多的时候可读性极差；标题文本由内容区 detail-title 单独展示） -->
  <el-dialog
    v-model="detailVisible"
    title="通知详情"
    width="480px"
    append-to-body
  >
    <div v-if="detailItem" class="notify-detail">
      <h4 class="detail-title">{{ detailItem.title }}</h4>
      <div class="detail-content">{{ detailItem.content || '（暂无正文）' }}</div>
      <div class="detail-time">{{ formatNotifyTime(detailItem.createdAt) }}</div>
    </div>
    <template #footer>
      <el-button @click="detailVisible = false">关闭</el-button>
      <!-- 查看详情：有 linkUrl 跳链接，无则兜底问题反馈页（2026-10-21 虎哥要求常显） -->
      <el-button type="primary" @click="goDetailLink">查看详情</el-button>
    </template>
  </el-dialog>
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
.avatar-img {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--el-fill-color-light, #f5f7fa);
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
/* ===== 通知面板 ===== */
/* 徽标小巧化（2026-10-23 虎哥：位置保持不动，只缩小视觉体积）。
   EP 默认 height 18px / font-size 12px / padding 6px，等比缩到 14/10/3，
   圆角同步 7px 保持胶囊形；top/right 维持原值不动。 */
.notify-badge :deep(.el-badge__content) {
  top: 6px;
  right: 10px;
  height: 14px;
  padding: 0 3px;
  font-size: 10px;
  border-radius: 7px;
}
.notify-mask {
  position: fixed;
  inset: 0;
  z-index: 25;
}
.notify-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 16px;
  width: 320px;
  background: #fff;
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  z-index: 30;
  overflow: hidden;
  /* 进场淡入 + 轻微下滑：消除点开铃铛时面板硬闪 */
  animation: notifyPanelIn 0.22s ease both;
}
.notify-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.notify-panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}
.notify-list {
  max-height: 380px;
  overflow-y: auto;
}
.notify-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f2f3f5;
  cursor: pointer;
  transition: background-color 0.15s;
}
.notify-item:hover {
  background: var(--el-color-primary-light-9, #ecf5ff);
}
.notify-item-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #606266;
}
.notify-item.unread .notify-item-title {
  color: #303133;
  font-weight: 600;
}
.notify-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--el-color-danger, #f56c6c);
}
.notify-item-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.notify-item-time {
  margin-top: 4px;
  font-size: 12px;
  color: #909399;
}
.notify-empty {
  padding: 20px 0;
  text-align: center;
  font-size: 13px;
  color: #909399;
}
/* ===== 通知详情弹窗 ===== */
.notify-detail .detail-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #303133;
}
/* 时间移末尾（2026-10-20）：与正文块同款 12px 间距 */
.notify-detail .detail-time {
  margin-top: 12px;
  font-size: 12px;
  color: #909399;
}
.notify-detail .detail-content {
  margin-top: 12px;
  font-size: 13px;
  color: #606266;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}
.about-body {
  min-height: 80px;
}
/* 技术支持 / 版本一行两端对齐 */
.about-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.about-meta .about-row {
  margin: 0;
}
.about-row {
  margin: 6px 0;
  font-size: 14px;
  color: #606266;
}
.about-notice {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed #ebeef5;
  font-size: 13px;
  color: #909399;
  line-height: 1.7;
}
/* 通知面板进场动画（淡入 + 下滑） */
@keyframes notifyPanelIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
