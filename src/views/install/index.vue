<template>
  <div class="install-wrap">
    <div class="install-card">
      <div class="install-head">
        <h1 class="install-title">火星财务 · 系统安装向导</h1>
        <p class="install-sub">
          首次部署请完成以下初始化设置，系统将创建管理员账号并标记初始化完成。
        </p>
      </div>

      <!-- 已完成初始化（含本次刚完成）：安装页关闭，倒计时跳登录 -->
      <el-result
        v-if="status?.initialized || installed"
        icon="success"
        :title="installed ? '初始化已完成' : '系统已完成初始化'"
        :sub-title="
          installed
            ? `即将在 ${countdown} 秒后跳转登录页面...`
            : '初始化仅可进行一次，安装向导已关闭。如需重新初始化，请由管理员登录后在「系统管理 → 系统重置」执行完整重置。'
        "
      >
        <template #extra>
          <el-button type="primary" @click="goLogin">立即前往登录</el-button>
        </template>
      </el-result>

      <!-- 未初始化：预检 + 表单 -->
      <template v-else>
        <el-card shadow="never" class="install-section">
          <template #header><span class="sec-title">环境预检</span></template>
          <div v-if="checks.length" class="check-list">
            <div v-for="c in checks" :key="c.name" class="check-row">
              <el-tag :type="c.ok ? 'success' : 'danger'" size="small">
                {{ c.ok ? '通过' : '失败' }}
              </el-tag>
              <span class="check-name">{{ c.name }}</span>
              <span class="check-detail">{{ c.detail }}</span>
            </div>
          </div>
          <el-skeleton v-else :rows="4" />
        </el-card>

        <el-card shadow="never" class="install-section">
          <template #header><span class="sec-title">管理员设置</span></template>
          <el-form :model="form" label-width="110px" class="install-form">
            <el-form-item label="管理员账号">
              <el-input v-model="form.adminUsername" placeholder="默认 admin" />
            </el-form-item>
            <el-form-item label="登录密码" required>
              <el-input
                v-model="form.adminPassword"
                type="password"
                show-password
                placeholder="请设置管理员登录密码（至少 6 位）"
              />
            </el-form-item>
            <el-form-item label="确认密码" required>
              <el-input
                v-model="confirmPwd"
                type="password"
                show-password
                placeholder="请再次输入密码"
              />
            </el-form-item>
            <el-form-item label="管理员昵称">
              <el-input v-model="form.adminNickname" placeholder="默认 系统管理员" />
            </el-form-item>
            <el-alert
              v-if="!allCheckOk"
              type="warning"
              :closable="false"
              class="install-tip"
              title="环境预检未全部通过，请先解决上述问题再初始化。"
            />
            <el-form-item>
              <el-button
                type="primary"
                :disabled="!canInit"
                :loading="submitting"
                @click="onInstall"
              >一键初始化</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getInitStatus, getPrecheck, doInit } from '@/api/system'
import { refreshInitState, getLastInitState } from '@/router'
import type { InitStatusVO, EnvCheckItem, InitRequest } from '@/types/system'

const router = useRouter()

const status = ref<InitStatusVO | null>(null)
const checks = ref<EnvCheckItem[]>([])
const form = reactive<InitRequest>({
  adminUsername: 'admin',
  adminPassword: '',
  adminNickname: '系统管理员',
})
const confirmPwd = ref('')
const submitting = ref(false)
// 本次刚完成初始化：进入倒计时跳登录流程
const installed = ref(false)
const countdown = ref(5)
let timer: number | null = null

const allCheckOk = computed(
  () => checks.value.length > 0 && checks.value.every((c) => c.ok),
)
const canInit = computed(
  () =>
    !!status.value &&
    !status.value.initialized &&
    allCheckOk.value &&
    !!form.adminPassword &&
    form.adminPassword.length >= 6 &&
    form.adminPassword === confirmPwd.value,
)

onMounted(async () => {
  try {
    // 复用路由守卫本次导航已探测到的状态（守卫分流时必然已探测过），
    // 避免 /system/init/status 被重复触发；守卫都没探到才自行请求兜底
    const st = getLastInitState() ?? (await getInitStatus())
    status.value = st
    // 已初始化时安装向导已关闭：后端 precheck 会返回 403，这里直接跳过不发请求
    if (st.initialized) return
    checks.value = await getPrecheck()
  } catch (e: any) {
    ElMessage.error(e?.message || '获取安装信息失败')
  }
})

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})

function goLogin() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  router.replace('/login')
}

async function onInstall() {
  if (!form.adminPassword) {
    ElMessage.warning('请设置管理员密码')
    return
  }
  if (form.adminPassword.length < 6) {
    ElMessage.warning('密码至少 6 位')
    return
  }
  if (form.adminPassword !== confirmPwd.value) {
    ElMessage.warning('两次输入的密码不一致')
    return
  }
  try {
    await ElMessageBox.confirm(
      '确认执行系统初始化？初始化后该操作不可重复，管理员账号将由此创建。',
      '初始化确认',
      { type: 'warning' },
    )
  } catch {
    return
  }
  submitting.value = true
  try {
    await doInit({ ...form })
    ElMessage.success('初始化完成，请使用设置的管理员账号登录')
    // 作废路由守卫里的初始化状态旧缓存（否则倒计时跳 /login 时守卫拿
    // 初始化前的 initialized=false 把导航打回 /install，表现为不跳转）
    await refreshInitState()
    installed.value = true
    countdown.value = 5
    timer = window.setInterval(() => {
      countdown.value -= 1
      if (countdown.value <= 0) {
        if (timer) {
          clearInterval(timer)
          timer = null
        }
        router.replace('/login')
      }
    }, 1000)
  } catch (e: any) {
    ElMessage.error(e?.message || '初始化失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.install-wrap {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  background: var(--el-bg-color-page, #f5f7fa);
  padding: 48px 16px;
}
.install-card {
  width: 100%;
  max-width: 560px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.06);
  padding: 28px 28px 32px;
}
/* 宽屏加宽一档（≥1280px）：560 → 680，预检明细与表单不再局促 */
@media (min-width: 1280px) {
  .install-card {
    max-width: 560px;
  }
}
.install-head {
  margin-bottom: 20px;
}
.install-title {
  font-size: 22px;
  font-weight: 700;
  margin: 0 0 6px;
}
.install-sub {
  color: #909399;
  font-size: 13px;
  margin: 0;
  line-height: 1.6;
}
.install-section {
  margin-bottom: 16px;
}
.sec-title {
  font-weight: 600;
}
.check-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
}
.check-name {
  font-weight: 500;
  min-width: 150px;
}
.check-detail {
  color: #909399;
  font-size: 12px;
}
.install-form {
  max-width: 460px;
}
.install-tip {
  margin-bottom: 12px;
}
</style>
