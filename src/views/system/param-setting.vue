<template>
  <div class="param-setting">
    <el-tabs v-model="activeTab" class="pt-tabs">
      <!-- 基本信息 -->
      <el-tab-pane label="基本信息" name="basic">
        <el-card shadow="never" class="pt-card">
          <el-form :model="basicForm" label-width="150px" class="pt-form">
            <el-form-item label="系统名称">
              <el-input v-model="basicForm.system_name" placeholder="如：火星财务" />
            </el-form-item>
            <el-form-item label="Logo 地址">
              <el-input v-model="basicForm.logo_url" placeholder="https://..." />
            </el-form-item>
            <el-form-item label="ICP 备案号">
              <el-input v-model="basicForm.icp_no" placeholder="京ICP备xxxx号" />
            </el-form-item>
            <el-form-item label="技术支持联系方式">
              <el-input v-model="basicForm.support_contact" placeholder="邮箱 / 电话" />
            </el-form-item>
            <el-form-item label="应用版本号">
              <el-input v-model="basicForm.app_version" placeholder="如：0.0.1" />
            </el-form-item>
            <el-form-item label="登录页公告">
              <el-input v-model="basicForm.login_notice" type="textarea" :rows="3" />
            </el-form-item>
            <el-form-item label="通知总开关">
              <el-switch
                :model-value="basicForm.notify_global_switch === 'true'"
                @change="(v: any) => (basicForm.notify_global_switch = v ? 'true' : 'false')"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="savingBasic" @click="saveBasic">保存</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-tab-pane>

      <!-- 用户协议 -->
      <el-tab-pane label="用户协议" name="terms">
        <agreement-manage code="TERMS" />
      </el-tab-pane>

      <!-- 隐私政策 -->
      <el-tab-pane label="隐私政策" name="privacy">
        <agreement-manage code="PRIVACY" />
      </el-tab-pane>

      <!-- 关于我们：卡片容器 + 富文本（无 label 展示） -->
      <el-tab-pane label="关于我们" name="about">
        <el-card shadow="never" class="pt-card">
          <RichEditor
            v-model="aboutForm.about_us"
            placeholder="支持富文本（标题 / 列表 / 链接 / 图片）"
          />
          <div class="pt-card-actions">
            <el-button type="primary" :loading="savingAbout" @click="saveAbout">保存</el-button>
          </div>
        </el-card>
      </el-tab-pane>

      <!-- 键值管理：独立 Tab，不再共享在所有 Tab 下 -->
      <el-tab-pane label="键值管理" name="adv">
        <div class="pt-adv-tip">全部配置项的原始键值（仅运营明确需要时在此调整）。</div>
        <el-table :data="advRows" size="default" border stripe>
          <el-table-column prop="configKey" label="键" width="280" />
          <el-table-column prop="remark" label="说明" min-width="260" show-overflow-tooltip />
          <el-table-column label="值">
            <template #default="{ row }">
              <el-input v-model="row.configValue" size="default" />
            </template>
          </el-table-column>
        </el-table>
        <el-button
          type="primary"
          class="pt-adv-save"
          size="default"
          :loading="savingAdv"
          @click="saveAdv"
        >保存全部键值</el-button>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getGroup, updateValues } from '../../api/config'
import AgreementManage from './agreement-manage.vue'
import RichEditor from '@/components/RichEditor.vue'
import type { ConfigItemVO } from '../../types/agreement'

const activeTab = ref('basic')

// 基本信息 / 关于我们 表单
const basicForm = reactive({
  system_name: '',
  logo_url: '',
  icp_no: '',
  support_contact: '',
  app_version: '',
  login_notice: '',
  notify_global_switch: 'true',
})
const aboutForm = reactive({ about_us: '' })

const savingBasic = ref(false)
const savingAbout = ref(false)

// 键值管理
const advRows = ref<ConfigItemVO[]>([])
const savingAdv = ref(false)

/** 把后端分组 config 拍平，并按 key 回填到结构化表单 + 键值表 */
function applyGroup(group: Record<string, ConfigItemVO[]>) {
  const flat: ConfigItemVO[] = []
  Object.values(group).forEach((list) => flat.push(...list))
  advRows.value = flat.map((c) => ({ ...c }))

  const get = (key: string) => flat.find((c) => c.configKey === key)?.configValue ?? ''
  basicForm.system_name = get('system_name')
  basicForm.logo_url = get('logo_url')
  basicForm.icp_no = get('icp_no')
  basicForm.support_contact = get('support_contact')
  basicForm.app_version = get('app_version')
  basicForm.login_notice = get('login_notice')
  basicForm.notify_global_switch = get('notify_global_switch') || 'true'
  aboutForm.about_us = get('about_us')
}

async function saveBasic() {
  savingBasic.value = true
  try {
    await updateValues({ ...basicForm })
    ElMessage.success('基本信息已保存')
  } finally {
    savingBasic.value = false
  }
}

async function saveAbout() {
  savingAbout.value = true
  try {
    await updateValues({ about_us: aboutForm.about_us })
    ElMessage.success('关于我们已保存')
  } finally {
    savingAbout.value = false
  }
}

async function saveAdv() {
  savingAdv.value = true
  try {
    const map: Record<string, string> = {}
    advRows.value.forEach((r) => {
      map[r.configKey] = r.configValue ?? ''
    })
    await updateValues(map)
    ElMessage.success('键值已保存')
  } finally {
    savingAdv.value = false
  }
}

onMounted(async () => {
  const group = await getGroup()
  applyGroup(group)
})
</script>

<style scoped>
/* 撑满内容区剩余高度，使协议/隐私卡片可内部滚动充满屏；其余 tab 内容超出时退回外层滚动 */
.param-setting {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 8px 4px;
}
.pt-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pt-tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
  margin: 0 0 6px;
}
.pt-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.pt-tabs :deep(.el-tab-pane) {
  height: 100%;
}
/* 白底卡片（与协议页 RichView 卡片一致：shadow=never 即白底） */
.pt-card {
  border: 1px solid var(--el-border-color-lighter, #ebeef5);
}
.pt-form {
  max-width: 640px;
  margin-top: 4px;
}
.pt-card-actions {
  margin-top: 16px;
}
.pt-adv-tip {
  color: #909399;
  font-size: 13px;
  margin: 4px 0 12px;
}
.pt-adv-save {
  margin-top: 16px;
}
</style>
