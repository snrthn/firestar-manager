<template>
  <div class="reset-page">
    <!-- 系统状态 -->
    <el-card shadow="never" class="ir-card">
      <template #header>
        <div class="ir-card-head">
          <span class="ir-title">系统状态</span>
          <el-button text :loading="loadingStatus" @click="loadStatus">刷新</el-button>
        </div>
      </template>
      <div v-if="status" class="ir-status">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="初始化状态">
            <el-tag :type="status.initialized ? 'success' : 'warning'">
              {{ status.initialized ? '已完成初始化' : '未初始化' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="试运行模式">
            <el-tag :type="status.trialMode ? 'success' : 'danger'">
              {{ status.trialMode ? '开启' : '已关闭' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="可重置">
            <el-tag :type="status.canReset ? 'success' : 'info'">
              {{ status.canReset ? '是' : '否' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="超管账号">
            <el-tag :type="status.adminExists ? 'success' : 'danger'">
              {{ status.adminExists ? '已存在' : '不存在' }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
      </div>
      <el-skeleton v-else :rows="4" />
    </el-card>

    <!-- 系统重置（初始化已完成，本页仅保留出厂设置交互） -->
    <el-card shadow="never" class="ir-card">
      <template #header><span class="ir-title">系统重置</span></template>
      <el-alert
        type="warning"
        :closable="false"
        class="ir-tip"
        title="重置将清空业务数据，操作不可恢复。仅试运行模式（trial_mode=true）下可用，且需二次确认 + 验证码。"
      />
      <div class="ir-reset-actions">
        <el-button
          type="warning"
          :disabled="!canResetHere"
          :title="resetDisabledTip"
          @click="openReset('light')"
        >轻度重置</el-button>
        <el-button
          type="danger"
          :disabled="!canResetHere"
          :title="resetDisabledTip"
          @click="openReset('full')"
        >完整重置（恢复出厂）</el-button>
      </div>
      <p v-if="!hasResetPerm" class="ir-perm-tip">
        当前账号缺少 system:reset 权限，无法执行重置。
      </p>
    </el-card>

    <!-- 重置二次确认对话框 -->
    <el-dialog
      v-model="resetVisible"
      :title="resetType === 'full' ? '完整重置确认' : '轻度重置确认'"
      width="480px"
      @closed="onResetClosed"
    >
      <el-alert :type="resetType === 'full' ? 'error' : 'warning'" :closable="false" :title="resetWarnText" class="ir-tip" />
      <el-form label-width="110px" class="ir-reset-form">
        <el-form-item label="确认词">
          <el-input v-model="confirmText" placeholder="请输入 RESET" />
          <div class="ir-hint">请输入大写 RESET 以确认你要执行的危险操作。</div>
        </el-form-item>
        <el-form-item>
          <el-button :disabled="confirmText !== 'RESET'" :loading="resetLoading" @click="requestVerifyCode">
            获取验证码
          </el-button>
        </el-form-item>
        <template v-if="generatedCode">
          <el-alert type="info" :closable="false" class="ir-tip">
            服务器已生成验证码：<b class="ir-code">{{ generatedCode }}</b>，请在下方输入以执行。
          </el-alert>
          <el-form-item label="验证码">
            <el-input v-model="verifyCode" placeholder="请输入上方验证码" />
          </el-form-item>
          <el-form-item>
            <el-button type="danger" :loading="resetLoading" @click="executeReset">确认执行重置</el-button>
          </el-form-item>
        </template>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getInitStatus, resetLight, resetFull } from '@/api/system'
import { useUserStore } from '@/stores/user'
import type { InitStatusVO } from '@/types/system'

const userStore = useUserStore()

const status = ref<InitStatusVO | null>(null)
const loadingStatus = ref(false)

const resetVisible = ref(false)
const resetType = ref<'light' | 'full'>('light')
const confirmText = ref('')
const verifyCode = ref('')
const generatedCode = ref('')
const resetLoading = ref(false)

const hasResetPerm = computed(() => userStore.hasPermission('system:reset'))
const canResetHere = computed(() => !!status.value?.canReset && hasResetPerm.value)
const resetDisabledTip = computed(() => {
  if (!hasResetPerm.value) return '无 system:reset 权限'
  if (!status.value?.trialMode) return '试运行模式已关闭，重置功能不可用'
  if (!status.value?.initialized) return '系统尚未初始化'
  return ''
})
const resetWarnText = computed(() =>
  resetType.value === 'full'
    ? '完整重置将清空全部数据并通过 Flyway 重建数据库（恢复出厂），超级管理员账号将重新生成。'
    : '轻度重置将清空业务数据表、Flowable 运行/历史数据与上传文件，保留系统配置。',
)

async function loadStatus() {
  loadingStatus.value = true
  try {
    status.value = await getInitStatus()
  } catch (e: any) {
    ElMessage.error(e?.message || '获取系统状态失败')
  } finally {
    loadingStatus.value = false
  }
}

function openReset(type: 'light' | 'full') {
  resetType.value = type
  confirmText.value = ''
  verifyCode.value = ''
  generatedCode.value = ''
  resetVisible.value = true
}

function onResetClosed() {
  confirmText.value = ''
  verifyCode.value = ''
  generatedCode.value = ''
  resetLoading.value = false
}

async function requestVerifyCode() {
  if (confirmText.value !== 'RESET') {
    ElMessage.warning('请先输入确认词 RESET')
    return
  }
  resetLoading.value = true
  try {
    const fn = resetType.value === 'full' ? resetFull : resetLight
    const res = await fn({ confirmText: 'RESET' })
    if (res.executed) {
      ElMessage.success(res.message || '重置完成')
      resetVisible.value = false
      await loadStatus()
    } else if (res.verifyCode) {
      generatedCode.value = res.verifyCode
      ElMessage.info('验证码已生成，请在对话框中输入以执行重置')
    } else {
      ElMessage.warning(res.message || '未返回验证码')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '获取验证码失败')
  } finally {
    resetLoading.value = false
  }
}

async function executeReset() {
  if (!verifyCode.value) {
    ElMessage.warning('请输入验证码')
    return
  }
  resetLoading.value = true
  try {
    const fn = resetType.value === 'full' ? resetFull : resetLight
    const res = await fn({ confirmText: 'RESET', verifyCode: verifyCode.value })
    if (res.executed) {
      ElMessage.success(res.message || '重置完成')
      resetVisible.value = false
      await loadStatus()
    } else {
      ElMessage.error(res.message || '重置未执行')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '重置失败')
  } finally {
    resetLoading.value = false
  }
}

onMounted(loadStatus)
</script>

<style scoped>
.reset-page {
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ir-card {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.ir-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ir-title {
  font-weight: 600;
}
.ir-form {
  max-width: 520px;
  margin-top: 4px;
}
.ir-tip {
  margin-bottom: 12px;
}
.ir-code {
  letter-spacing: 2px;
  font-family: monospace;
}
.ir-reset-actions {
  display: flex;
  gap: 12px;
  margin: 8px 0;
}
.ir-hint {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
}
.ir-perm-tip {
  color: #e6a23c;
  font-size: 13px;
  margin-top: 4px;
}
.ir-reset-form {
  margin-top: 12px;
}
</style>
