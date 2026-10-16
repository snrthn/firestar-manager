<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { updateProfile, changePassword } from '@/api/auth'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import { formatDateTime as fmt } from '@/utils/datetime'
import type { FormRules } from 'element-plus'

// 若依风格个人中心：左侧只读信息卡 + 右侧「基本资料 / 修改密码」两个 Tab。
// 数据直接读登录后已就绪的 userInfo（ProfileVO），无需额外拉取。
const userStore = useUserStore()
const profile = computed(() => userStore.userInfo)

const initial = computed(
  () => (profile.value?.nickname || profile.value?.username || '管').slice(0, 1)
)
const statusType = computed(() =>
  profile.value?.status === 'ENABLED' ? 'success' : 'danger'
)
const statusText = computed(() =>
  profile.value?.status === 'ENABLED' ? '启用' : '禁用'
)
const forceChange = computed(() => profile.value?.forceChangePassword === true)

// ===== 基本资料 =====
const baseForm = reactive({ nickname: '', phone: '', email: '' })
const baseRef = ref()
const baseSaving = ref(false)

function seedBase() {
  const p = profile.value
  if (!p) return
  baseForm.nickname = p.nickname || ''
  baseForm.phone = p.phone || ''
  baseForm.email = p.email || ''
}
seedBase()
watch(profile, seedBase)

const baseRules: FormRules = {
  nickname: [{ required: true, message: '请输入昵称', trigger: 'blur' }],
  phone: [{ pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
}

async function saveBase() {
  const ok = await (baseRef.value?.validate() ?? Promise.resolve(true))
    .then(() => true)
    .catch(() => false)
  if (!ok) return
  baseSaving.value = true
  try {
    await updateProfile({
      nickname: baseForm.nickname.trim(),
      phone: baseForm.phone.trim(),
      email: baseForm.email.trim(),
    })
    // 回写 store：让 header 昵称与全局 userInfo 同步刷新
    await userStore.fetchProfile()
    ElMessage.success('资料已保存')
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    baseSaving.value = false
  }
}

// ===== 修改密码 =====
const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdRef = ref()
const pwdSaving = ref(false)

const pwdRules = computed((): FormRules => ({
  oldPassword: forceChange.value
    ? []
    : [{ required: true, message: '请输入原密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度 6-20 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_r: any, value: any, cb: any) => {
        if (value !== pwdForm.newPassword) cb(new Error('两次输入的密码不一致'))
        else cb()
      },
      trigger: 'blur',
    },
  ],
}))

async function savePwd() {
  const ok = await (pwdRef.value?.validate() ?? Promise.resolve(true))
    .then(() => true)
    .catch(() => false)
  if (!ok) return
  pwdSaving.value = true
  try {
    await changePassword({
      oldPassword: pwdForm.oldPassword || undefined,
      newPassword: pwdForm.newPassword,
    })
    ElMessage.success('密码修改成功')
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
  } catch (e: any) {
    ElMessage.error(e?.message || '修改失败')
  } finally {
    pwdSaving.value = false
  }
}
</script>

<template>
  <div class="profile">
    <!-- 左侧：只读信息卡（若依个人中心左侧栏） -->
    <el-card class="info-card" shadow="hover">
      <div class="info-head">
        <span class="avatar">{{ initial }}</span>
        <div class="info-name">{{ profile?.nickname || profile?.username }}</div>
        <div class="info-roles">
          <el-tag
            v-for="r in profile?.roles || []"
            :key="r.roleCode"
            type="primary"
            size="small"
            effect="light"
          >
            {{ r.roleName }}
          </el-tag>
        </div>
      </div>

      <el-descriptions :column="1" border size="small" class="info-desc">
        <el-descriptions-item label="昵称">{{ profile?.nickname || '—' }}</el-descriptions-item>
        <el-descriptions-item label="用户名">{{ profile?.username || '—' }}</el-descriptions-item>
        <el-descriptions-item label="手机">{{ profile?.phone || '—' }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ profile?.email || '—' }}</el-descriptions-item>
        <el-descriptions-item label="部门">{{ profile?.deptName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="岗位">{{ profile?.postName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="直属上级">{{ profile?.parentName || '—' }}</el-descriptions-item>
        <el-descriptions-item label="角色">
          {{ (profile?.roles || []).map((r) => r.roleName).join('、') || '—' }}
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusType" size="small" effect="light">{{ statusText }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ fmt(profile?.createdAt) }}</el-descriptions-item>
        <el-descriptions-item label="最后登录时间">{{ fmt(profile?.lastLoginAt) }}</el-descriptions-item>
        <el-descriptions-item label="最后登录 IP">
          <span class="ip-cell" :title="profile?.lastLoginIp || ''">{{ profile?.lastLoginIp || '—' }}</span>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 右侧：基本资料 / 修改密码 -->
    <el-card class="main-card" shadow="hover">
      <el-tabs>
        <el-tab-pane label="基本资料">
          <el-form
            ref="baseRef"
            :model="baseForm"
            :rules="baseRules"
            label-width="80px"
            class="profile-form"
            @submit.prevent
          >
            <el-form-item label="用户名">
              <el-input :model-value="profile?.username" disabled />
            </el-form-item>
            <el-form-item label="昵称" prop="nickname">
              <el-input v-model="baseForm.nickname" placeholder="请输入昵称" maxlength="30" />
            </el-form-item>
            <el-form-item label="手机号" prop="phone">
              <el-input v-model="baseForm.phone" placeholder="请输入手机号" maxlength="11" />
            </el-form-item>
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="baseForm.email" placeholder="请输入邮箱" maxlength="50" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="baseSaving" @click="saveBase">保存</el-button>
              <el-button @click="seedBase">重置</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>

        <el-tab-pane label="修改密码">
          <el-form
            ref="pwdRef"
            :model="pwdForm"
            :rules="pwdRules"
            label-width="80px"
            class="profile-form"
            @submit.prevent
          >
            <el-form-item v-if="!forceChange" label="原密码" prop="oldPassword">
              <el-input
                v-model="pwdForm.oldPassword"
                type="password"
                show-password
                placeholder="请输入原密码"
              />
            </el-form-item>
            <el-form-item label="新密码" prop="newPassword">
              <el-input
                v-model="pwdForm.newPassword"
                type="password"
                show-password
                placeholder="6-20 位"
              />
            </el-form-item>
            <el-form-item label="确认密码" prop="confirmPassword">
              <el-input
                v-model="pwdForm.confirmPassword"
                type="password"
                show-password
                placeholder="请再次输入新密码"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="pwdSaving" @click="savePwd">修改密码</el-button>
            </el-form-item>
          </el-form>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}
.info-card {
  width: 480px;
  flex-shrink: 0;
  border-radius: 8px;
}
/* IP 定宽 + 超出省略：IPv4/IPv6 长度差一倍多，不固定宽度会把描述列表内容列
   撑得时宽时窄（2026-10-17 虎哥要求，同操作日志详情弹窗口径）；title 兜底全值 */
.ip-cell {
  display: inline-block;
  width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}
.main-card {
  flex: 1;
  min-width: 0;
  border-radius: 8px;
}

/* 左侧信息卡头部 */
.info-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0 18px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
  margin-bottom: 16px;
}
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--fs-primary);
  color: #fff;
  font-size: 26px;
  font-weight: 600;
}
.info-name {
  margin-top: 12px;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.info-roles {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
}

/* 描述列表占满卡片宽度，值列吃满剩余空间（同 dashboard 健康表做法） */
.info-desc {
  width: 100%;
}
.info-desc :deep(.el-descriptions__body),
.info-desc :deep(.el-descriptions__table) {
  width: 100%;
  table-layout: fixed;
}
.info-desc :deep(.el-descriptions__label) {
  width: 110px;
  color: #606266;
}
.info-desc :deep(.el-descriptions__content) {
  word-break: break-word;
}
/* 行高再缩小：每个单元格上下 padding 保持紧凑 */
.info-desc :deep(.el-descriptions__cell) {
  padding-top: 8px !important;
  padding-bottom: 8px !important;
}

/* 右侧表单：限制宽度，避免在大屏上拉得过长 */
.profile-form {
  max-width: 480px;
  padding-top: 8px;
}
</style>
