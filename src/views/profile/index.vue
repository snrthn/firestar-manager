<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Camera } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { updateProfile, changePassword } from '@/api/auth'
import { listConsents, withdraw, consent } from '@/api/agreement'
import { updateAvatar } from '@/api/profile'
import AvatarCropper from '@/components/AvatarCropper.vue'
import { useAvatar } from '@/composables/useAvatar'
import ElMessage from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import { formatDateTime as fmt } from '@/utils/datetime'
import type { FormRules } from 'element-plus'
import type { AgreementVO } from '@/types/agreement'

// 若依风格个人中心：左侧只读信息卡 + 右侧「基本资料 / 修改密码 / 隐私与协议」三个 Tab。
// 数据直接读登录后已就绪的 userInfo（ProfileVO），无需额外拉取。
const userStore = useUserStore()
const profile = computed(() => userStore.userInfo)

const initial = computed(
  () => (profile.value?.nickname || profile.value?.username || '管').slice(0, 1)
)
// 真实头像：后端存 sys_file_storage.id，经 useAvatar 解析为可渲染地址
const avatarSrc = useAvatar(computed(() => profile.value?.avatarUrl))
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

// ===== 头像上传（免 file:manage，走 /system/profile/avatar）=====
// 2026-10-21 需求②：选图后先过裁切弹窗，确认导出 256×256 才真正上传，
// 落库头像必为裁切产物（正方形）。el-upload 只承担「选文件 + beforeAvatar 校验」。
const cropFile = ref<File | null>(null)
const cropperVisible = ref(false)

function onAvatarPicked(options: { file: File }) {
  cropFile.value = options.file
  cropperVisible.value = true
}

async function onCropConfirm(blob: Blob) {
  const form = new FormData()
  // 裁切产物统一 PNG 命名；后端按 multipart 字段名 file 接收
  form.append('file', blob, 'avatar.png')
  try {
    await updateAvatar(form)
    // 回写 userInfo.avatarUrl，让 header 头像同步刷新
    await userStore.fetchProfile()
    ElMessage.success('头像已更新')
    cropperVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '头像上传失败')
  }
}

function beforeAvatar(file: File) {
  const okType =
    file.type === 'image/jpeg' ||
    file.type === 'image/png' ||
    file.type === 'image/gif' ||
    file.type === 'image/webp'
  if (!okType) {
    ElMessage.error('头像仅支持 JPG / PNG / GIF / WEBP 图片')
    return false
  }
  const max = 2 * 1024 * 1024
  if (file.size > max) {
    ElMessage.error('头像大小不能超过 2MB')
    return false
  }
  return true
}

// ===== 隐私与协议（个人中心：已同意列表 + 撤回） =====
const consents = ref<AgreementVO[]>([])
const consentLoading = ref(false)

async function loadConsents() {
  consentLoading.value = true
  try {
    consents.value = await listConsents()
  } catch {
    ElMessage.error('加载协议同意记录失败')
  } finally {
    consentLoading.value = false
  }
}
// 切到该 Tab 时加载（初始进入个人中心不一定在该 Tab，故 onMounted 先拉一次）
loadConsents()

async function withdrawAgreement(item: AgreementVO) {
  try {
    await ElMessageBox.confirm(
      `确定要撤回对《${item.name}》的同意吗？撤回后下次进入系统将重新要求确认该协议。`,
      '撤回确认',
      { type: 'warning', confirmButtonText: '撤回', cancelButtonText: '取消' }
    )
  } catch {
    return
  }
  try {
    await withdraw(item.agreementId, { versionId: item.versionId })
    ElMessage.success('已撤回同意，下次进入系统将重新要求确认')
    await loadConsents()
  } catch (e: any) {
    ElMessage.error(e?.message || '撤回失败')
  }
}

// 撤回后：个人中心内直接重新确认（无需等下次进站弹层）
async function reconsentAgreement(item: AgreementVO) {
  try {
    await consent(item.agreementId, { versionId: item.versionId, channel: 'SETTINGS' })
    ElMessage.success('已重新确认同意')
    await loadConsents()
  } catch (e: any) {
    ElMessage.error(e?.message || '确认失败')
  }
}
</script>

<template>
  <div class="profile">
    <!-- 左侧：只读信息卡（若依个人中心左侧栏） -->
    <el-card class="info-card" shadow="hover">
      <div class="info-head">
        <el-upload
          class="avatar-uploader"
          :show-file-list="false"
          :http-request="onAvatarPicked"
          accept="image/*"
          :before-upload="beforeAvatar"
        >
          <div class="avatar-wrap">
            <img v-if="avatarSrc" :src="avatarSrc" class="avatar-img" :alt="profile?.nickname" />
            <span v-else class="avatar">{{ initial }}</span>
            <div class="avatar-mask">
              <el-icon :size="18"><Camera /></el-icon>
              <span>更换</span>
            </div>
          </div>
        </el-upload>
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

    <!-- 右侧：基本资料 / 修改密码 / 隐私与协议 -->
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

        <!-- 隐私与协议：当前用户对各协议的同意记录，可撤回 -->
        <el-tab-pane label="隐私与协议">
          <div v-loading="consentLoading" class="consent-list">
            <el-empty v-if="!consentLoading && consents.length === 0" description="暂无协议记录" />
            <div v-for="item in consents" :key="item.agreementId" class="consent-item">
              <div class="consent-info">
                <div class="consent-name">
                  {{ item.name }}
                  <el-tag size="small" effect="plain" class="consent-ver">{{ item.version }}</el-tag>
                </div>
                <div class="consent-meta">
                  <span>
                    状态：
                    <el-tag
                      :type="item.lastAction === 'AGREE' ? 'success' : 'info'"
                      size="small"
                      effect="light"
                    >
                      {{ item.lastAction === 'AGREE' ? '已同意' : item.lastAction === 'WITHDRAW' ? '已撤回' : '未处理' }}
                    </el-tag>
                  </span>
                  <span v-if="item.consentedAt" class="consent-time">
                    同意时间：{{ fmt(item.consentedAt) }}
                  </span>
                </div>
              </div>
              <el-button
                v-if="item.lastAction === 'AGREE'"
                size="small"
                type="danger"
                plain
                @click="withdrawAgreement(item)"
              >撤回同意</el-button>
              <el-button
                v-else-if="item.lastAction === 'WITHDRAW'"
                size="small"
                type="primary"
                plain
                @click="reconsentAgreement(item)"
              >重新确认</el-button>
              <el-tag v-else size="small" type="info" effect="plain">未同意</el-tag>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 头像裁切弹窗（需求②）：选图 → 裁切 → 确认上传 -->
    <avatar-cropper
      v-model="cropperVisible"
      :file="cropFile"
      @confirm="onCropConfirm"
    />
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
/* 头像上传包裹层：hover 显示「更换」遮罩，点击触发 el-upload */
.avatar-uploader {
  line-height: 0;
}
.avatar-wrap {
  position: relative;
  width: 64px;
  height: 64px;
  cursor: pointer;
}
.avatar-wrap .avatar-img {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  background: var(--el-fill-color-light, #f5f7fa);
}
.avatar-mask {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}
.avatar-wrap:hover .avatar-mask {
  opacity: 1;
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

/* 隐私与协议列表 */
.consent-list {
  min-height: 120px;
}
.consent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.consent-item:last-child {
  border-bottom: none;
}
.consent-name {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  display: flex;
  align-items: center;
  gap: 8px;
}
.consent-ver {
  font-weight: 400;
}
.consent-meta {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;
  color: #909399;
}
</style>
