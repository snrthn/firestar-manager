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

      <!-- 键值管理：查询条件 + 列表 + 分页器标准布局 -->
      <el-tab-pane label="键值管理" name="adv">
        <div class="pt-adv-tip">
          系统级原始键值（基本信息 / 关于我们 Tab 中维护的项已不在此表，请到对应 Tab 修改）。
        </div>

        <!-- 查询条件 -->
        <el-form :inline="true" class="pt-adv-query" @submit.prevent>
          <el-form-item label="键">
            <el-input
              v-model="query.keywordKey"
              placeholder="模糊匹配键"
              clearable
              style="width: 220px"
              @keyup.enter="onQuery"
            />
          </el-form-item>
          <el-form-item label="说明">
            <el-input
              v-model="query.keywordRemark"
              placeholder="模糊匹配说明"
              clearable
              style="width: 220px"
              @keyup.enter="onQuery"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="onQuery">查询</el-button>
            <el-button @click="onResetQuery">重置</el-button>
          </el-form-item>
          <el-form-item class="pt-adv-query-new">
            <el-button type="primary" @click="openCreateDialog">新建键值</el-button>
          </el-form-item>
        </el-form>

        <!-- 列表（值纯文本展示，修改走编辑弹窗） -->
        <el-table :data="pagedRows" border stripe>
          <el-table-column prop="configKey" label="键" min-width="260" show-overflow-tooltip />
          <el-table-column prop="remark" label="说明" min-width="220" show-overflow-tooltip />
          <el-table-column label="值" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="pt-adv-value">{{ row.configValue || '-' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="90" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openEditDialog(row)">编辑</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页器（配置数据量小，前端分页；接口仍全量返回） -->
        <!-- 容器类名统一到全站 .pagination-bar（pages.css 全局），不再自定义 .pt-adv-pager -->
        <div class="pagination-bar">
          <el-pagination
            v-model:current-page="query.page"
            v-model:page-size="query.pageSize"
            :total="filteredRows.length"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper"
            background
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 新建 / 编辑共用弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建键值' : '编辑键值'"
      width="480px"
      append-to-body
    >
      <el-form ref="dialogFormRef" :model="dialogForm" :rules="dialogRules" label-width="80px">
        <el-form-item label="键" prop="configKey">
          <el-input
            v-model="dialogForm.configKey"
            :disabled="dialogMode === 'edit'"
            placeholder="如：biz_invoice_enabled"
          />
        </el-form-item>
        <el-form-item label="值" prop="configValue">
          <el-input v-model="dialogForm.configValue" placeholder="如：true" />
        </el-form-item>
        <el-form-item label="说明" prop="remark">
          <el-input
            v-model="dialogForm.remark"
            type="textarea"
            :rows="2"
            placeholder="选填，建议说明该键值的用途"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="dialogSubmitting" @click="submitDialog">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { getGroup, updateValues, createConfig, updateConfigItem } from '../../api/config'
import { useAppStore } from '@/stores/app'
import AgreementManage from './agreement-manage.vue'
import RichEditor from '@/components/RichEditor.vue'
import type { ConfigItemVO } from '../../types/agreement'

const activeTab = ref('basic')
const appStore = useAppStore()

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

/**
 * 已在基本信息 / 关于我们 Tab 结构化维护的 key（2026-10-20 虎哥要求去重）：
 * 这些项此前在键值表里重复出现——同一处数据两个入口可改，容易改串。
 * 键值表只保留剩余的系统级原始键值。
 * 注：sys_config 全表 config_type 均为 SYSTEM（V25 种子实锤），没有可按维度
 * 剔除的「基本信息」分组，只能按 key 集合过滤；open_source_notice 为 2026-10-21
 * 补录的漏网项（V25 结构化 key，关于我们弹窗复用）。
 */
const STRUCTURED_KEYS = new Set([
  'system_name',
  'logo_url',
  'icp_no',
  'support_contact',
  'app_version',
  'login_notice',
  'notify_global_switch',
  'about_us',
  'open_source_notice',
])

// ===== 键值管理：全量 → 查询过滤 → 分页 =====
const advRows = ref<ConfigItemVO[]>([])

const query = reactive({
  keywordKey: '',
  keywordRemark: '',
  page: 1,
  pageSize: 10,
})

/** 查询条件过滤（键 / 说明模糊匹配，忽略大小写） */
const filteredRows = computed(() => {
  const k = query.keywordKey.trim().toLowerCase()
  const r = query.keywordRemark.trim().toLowerCase()
  return advRows.value.filter((row) => {
    if (k && !row.configKey.toLowerCase().includes(k)) return false
    if (r && !(row.remark ?? '').toLowerCase().includes(r)) return false
    return true
  })
})

/** 当前页数据（前端分页，数据量为配置项总量，天然小表） */
const pagedRows = computed(() => {
  const start = (query.page - 1) * query.pageSize
  return filteredRows.value.slice(start, start + query.pageSize)
})

function onQuery() {
  query.page = 1
}

function onResetQuery() {
  query.keywordKey = ''
  query.keywordRemark = ''
  query.page = 1
}

/** 把后端分组 config 拍平，按 key 回填结构化表单；键值表剔除已结构化维护的 key */
function applyGroup(group: Record<string, ConfigItemVO[]>) {
  const flat: ConfigItemVO[] = []
  Object.values(group).forEach((list) => flat.push(...list))
  advRows.value = flat.filter((c) => !STRUCTURED_KEYS.has(c.configKey)).map((c) => ({ ...c }))

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

async function loadGroup() {
  const group = await getGroup()
  applyGroup(group)
}

async function saveBasic() {
  savingBasic.value = true
  try {
    await updateValues({ ...basicForm })
    ElMessage.success('基本信息已保存')
    // 保存即生效：系统名 / Logo 变了，侧栏品牌标识立刻跟着变（force 重拉一次）
    appStore.loadBrand(true)
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

// ===== 新建 / 编辑共用弹窗 =====
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const dialogSubmitting = ref(false)
const dialogFormRef = ref<FormInstance>()
const dialogForm = reactive({
  configKey: '',
  configValue: '',
  remark: '',
})
const dialogRules: FormRules = {
  configKey: [
    { required: true, message: '请输入配置键', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_-]{2,64}$/,
      message: '仅支持字母/数字/下划线/短横线，2-64 位',
      trigger: 'blur',
    },
  ],
  configValue: [{ required: true, message: '请输入配置值', trigger: 'blur' }],
}

function openCreateDialog() {
  dialogMode.value = 'create'
  dialogForm.configKey = ''
  dialogForm.configValue = ''
  dialogForm.remark = ''
  dialogVisible.value = true
  // 等 dialog 渲染完再清校验状态，避免上一次的红框残留
  setTimeout(() => dialogFormRef.value?.clearValidate(), 0)
}

function openEditDialog(row: ConfigItemVO) {
  dialogMode.value = 'edit'
  dialogForm.configKey = row.configKey
  dialogForm.configValue = row.configValue ?? ''
  dialogForm.remark = row.remark ?? ''
  dialogVisible.value = true
  setTimeout(() => dialogFormRef.value?.clearValidate(), 0)
}

async function submitDialog() {
  if (!dialogFormRef.value) return
  try {
    await dialogFormRef.value.validate()
  } catch {
    return
  }
  dialogSubmitting.value = true
  try {
    const payload = {
      configKey: dialogForm.configKey.trim(),
      configValue: dialogForm.configValue,
      remark: dialogForm.remark.trim() || undefined,
    }
    if (dialogMode.value === 'create') {
      await createConfig(payload)
      ElMessage.success('键值已创建')
    } else {
      await updateConfigItem(payload)
      ElMessage.success('键值已更新')
    }
    dialogVisible.value = false
    // 重新拉取分组，让列表反映最新数据
    await loadGroup()
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    dialogSubmitting.value = false
  }
}

onMounted(loadGroup)
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
.pt-adv-query {
  margin-bottom: 4px;
}
.pt-adv-query .el-form-item {
  margin-bottom: 12px;
}
/* 新建按钮靠查询条件行右侧 */
.pt-adv-query-new {
  float: right;
}
.pt-adv-value {
  word-break: break-all;
}
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
</style>
