<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore } from '@/stores/app'
import { useTabsStore } from '@/stores/tabs'
import { useUserStore } from '@/stores/user'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { listPending, consent } from '@/api/agreement'
import { ElMessage } from 'element-plus'
import type { AgreementVO } from '@/types/agreement'
import RichView from '@/components/RichView.vue'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTabs from '@/components/layout/AppTabs.vue'

const appStore = useAppStore()
const tabsStore = useTabsStore()
const userStore = useUserStore()
const { isCompact } = useBreakpoint()
const route = useRoute()
const router = useRouter()

// 页签右键「刷新当前页」：自增 reloadKey 强制 router-view 下的组件重新挂载。
// AdminLayout provide 出去，AppTabs 的「刷新」菜单项 inject 调用。
const reloadKey = ref(0)
function reload() {
  reloadKey.value++
}
provide('reload', reload)

// keep-alive 缓存集合：isCache=1 的菜单（后端 sys_menu.is_cache，种子默认 0）。
// include 匹配「组件 name」——resolveView 包装层注入的 name 与动态路由名同规则
// （routeNameFor），cachedRouteNames 在 store 里同源计算，三处对齐才命中。
const cachedViews = computed(() => userStore.cachedRouteNames)

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

// ===== 协议强制确认弹层（P1） =====
// 钉死：不放 router.beforeEach；放 AdminLayout onMounted；不可绕过（modal 遮罩挡内容区）。
// 队列式确认：pending 多条时逐条展示，全部同意后才放行进站。
const pendingList = ref<AgreementVO[]>([])
const agreeIdx = ref(0)
const agreeing = ref(false)

const currentAgree = computed<AgreementVO | null>(
  () => pendingList.value[agreeIdx.value] ?? null
)
// el-dialog 用单向 model-value：遮罩/ESC/关闭按钮全部禁用，用户无法绕过
const showAgree = computed(
  () => pendingList.value.length > 0 && agreeIdx.value < pendingList.value.length
)

async function checkPending() {
  try {
    const list = await listPending()
    pendingList.value = Array.isArray(list) ? list : []
    agreeIdx.value = 0
  } catch {
    // 拉取失败不影响主流程进站（协议弹层是增强项，不是进站闸门）
    pendingList.value = []
  }
}

async function agreeCurrent() {
  const cur = currentAgree.value
  if (!cur) return
  agreeing.value = true
  try {
    await consent(cur.agreementId, { versionId: cur.versionId, channel: 'LOGIN' })
    agreeIdx.value++
  } catch (e: any) {
    // 原为静默吞掉：同意失败只是停在当前条、按钮恢复，用户以为没点到。
    // 这是明确的写操作，失败必须让用户看见并可重试。
    ElMessage.error(e?.message || '协议同意失败，请重试')
  } finally {
    agreeing.value = false
  }
}

async function refuseAll() {
  await userStore.logout()
  router.push('/login')
}

onMounted(() => {
  checkPending()
  // 品牌标识（系统名 + Logo 链接）：进站拉一次，侧栏据此决定「图片 or 默认标识」
  appStore.loadBrand()
})
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
          <!-- keep-alive：isCache=1 的菜单页面切走再切回时保留状态（列表滚动/表单草稿）。
               key 必须含 route.path——keep-alive 缓存键是 vnode key，全局共用一个
               reloadKey 会让所有页面撞成同一个缓存键互相顶掉（2026-10-15 实测教训）；
               reloadKey 参与 key 保证页签右键「刷新当前页」仍能清缓存重挂。
               用 path 不用 fullPath：query 变化（如字典数据 ?typeCode=A→B）不重建组件，
               由组件内部 watch route.query 自行响应，避免被打回初始态。 -->
          <router-view v-slot="{ Component }">
            <keep-alive :include="cachedViews">
              <component :is="Component" :key="route.path + ':' + reloadKey" />
            </keep-alive>
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

    <!-- 协议强制确认弹层：不可绕过（modal 遮罩挡内容区，禁止点遮罩/ESC/关闭按钮关） -->
    <el-dialog
      :model-value="showAgree"
      :title="currentAgree?.needReconsent ? '协议已更新，请重新确认' : '请阅读并同意用户协议'"
      width="640px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
      append-to-body
      class="agree-dialog"
    >
      <div v-if="currentAgree" class="agree-body">
        <div class="agree-name">
          {{ currentAgree.name }}
          <el-tag size="small" effect="plain" class="agree-ver">{{ currentAgree.version }}</el-tag>
        </div>
        <div v-if="currentAgree.changeSummary" class="agree-summary">
          变更摘要：{{ currentAgree.changeSummary }}
        </div>
        <RichView
          v-if="currentAgree.content"
          :html="currentAgree.content"
          class="agree-content"
        />
      </div>
      <template #footer>
        <el-button @click="refuseAll">不同意，退出登录</el-button>
        <el-button type="primary" :loading="agreeing" @click="agreeCurrent">
          同意并继续
        </el-button>
      </template>
    </el-dialog>
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

/* 协议弹层 */
.agree-name {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}
.agree-ver {
  font-weight: 400;
}
.agree-summary {
  margin-top: 8px;
  font-size: 13px;
  color: #909399;
}
.agree-content {
  margin-top: 12px;
  max-height: 50vh;
  overflow: auto;
  word-break: break-word;
  color: #303133;
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 6px;
  padding: 12px;
}
</style>
