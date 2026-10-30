<template>
  <div class="agreement-manage">
    <el-row>
      <!-- 左：当前生效版本正文（富文本，DOMPurify 净化渲染） -->
      <el-col :span="12">
        <el-card shadow="never" class="agr-card">
          <template #header>
            <span class="agr-title">当前生效版本：{{ current?.version || '—' }}</span>
            <el-button
              size="small"
              type="primary"
              class="agr-publish-btn"
              v-has-perm="'agreement:publish'"
              @click="openPublish"
            >发布新版本</el-button>
          </template>
          <RichView v-if="current?.content" :html="current.content" class="agr-content" />
          <el-empty v-else description="暂无协议内容" />
          <div v-if="current?.changeSummary" class="agr-summary">
            变更摘要：{{ current.changeSummary }}
          </div>
        </el-card>
      </el-col>

      <!-- 右：版本历史 -->
      <el-col :span="12">
        <el-card shadow="never" class="agr-card">
          <template #header><span class="agr-title">版本历史（只增不改）</span></template>
          <el-table :data="versions" size="default" stripe height="100%">
            <el-table-column prop="ver" label="版本" width="70" />
            <el-table-column prop="changeSummary" label="变更摘要" show-overflow-tooltip />
            <el-table-column prop="effectiveAt" label="生效时间" width="160">
              <template #default="{ row }">
                {{ formatDateTime(row.effectiveAt) }}
              </template>
            </el-table-column>
            <el-table-column label="重同意" width="70" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.needReconsent" type="warning" size="small">需重同意</el-tag>
                <span v-else>—</span>
              </template>
            </el-table-column>
          <template #empty>
            <EmptyState />
          </template>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 发布新版本对话框（正文用 Tiptap 富文本编辑器） -->
    <el-dialog v-model="publishVisible" title="发布新版本" width="640px" append-to-body>
      <el-form :model="publishForm" label-width="100px">
        <el-form-item label="变更摘要" required>
          <el-input v-model="publishForm.changeSummary" placeholder="如：2026 年条款更新" />
        </el-form-item>
        <el-form-item label="协议正文" required>
          <RichEditor v-model="publishForm.content" placeholder="支持富文本（标题 / 列表 / 链接 / 图片）" />
        </el-form-item>
        <el-form-item label="要求重同意">
          <el-switch v-model="publishForm.needReconsent" />
          <span class="agr-tip">开启后，已同意用户下次登录将被强制重新确认</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="publishVisible = false">取消</el-button>
        <el-button type="primary" :loading="publishing" v-has-perm="'agreement:publish'" @click="doPublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import EmptyState from '@/components/EmptyState.vue'
import { formatDateTime } from '@/utils/datetime'
import { ElMessage } from 'element-plus'
import RichView from '@/components/RichView.vue'
import RichEditor from '@/components/RichEditor.vue'
import { listActive, listVersions, publishVersion } from '../../api/agreement'
import type { AgreementVO, AgreementVersion } from '../../types/agreement'

const props = defineProps<{ code: 'TERMS' | 'PRIVACY' }>()

const current = ref<AgreementVO | null>(null)
const versions = ref<AgreementVersion[]>([])
const loading = ref(false)

const publishVisible = ref(false)
const publishing = ref(false)
const publishForm = ref({
  changeSummary: '',
  content: '',
  needReconsent: false,
})

async function load() {
  loading.value = true
  try {
    const all = await listActive()
    current.value = all.find((a) => a.code === props.code) ?? null
    if (current.value) {
      versions.value = await listVersions(current.value.agreementId)
    }
  } catch (e) {
    ElMessage.error('协议数据加载失败，请刷新页面')
  } finally {
    loading.value = false
  }
}

function openPublish() {
  if (!current.value) {
    ElMessage.warning('协议尚未加载，请刷新页面后再试')
    return
  }
  publishForm.value = { changeSummary: '', content: current.value.content ?? '', needReconsent: false }
  publishVisible.value = true
}

async function doPublish() {
  if (!current.value) return
  if (!publishForm.value.changeSummary.trim() || !publishForm.value.content.trim()) {
    ElMessage.warning('变更摘要与协议正文均为必填')
    return
  }
  publishing.value = true
  try {
    await publishVersion({
      agreementId: current.value.agreementId,
      content: publishForm.value.content,
      changeSummary: publishForm.value.changeSummary,
      needReconsent: publishForm.value.needReconsent,
    })
    ElMessage.success('新版本已发布')
    publishVisible.value = false
    await load()
  } finally {
    publishing.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.agreement-manage {
  height: 100%;
  box-sizing: border-box;
  padding: 0;
  display: flex;
  flex-direction: column;
}
/* 行/列撑满卡片容器高度；两卡间距用 gap（无 gutter，保证与基本信息卡片左右边缘对齐） */
.agreement-manage :deep(.el-row) {
  flex: 1;
  min-height: 0;
  margin: 0 !important;
  gap: 16px;
}
.agreement-manage :deep(.el-col) {
  height: 100%;
  /* 弹性等分取代 span 固定 50%：容纳 row 的 gap:16px 而不触发换行 */
  flex: 1 1 0;
  min-width: 0;
}
.agr-card {
  margin-bottom: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
/* 卡片体内部滚动，使协议长文/版本表充满屏并可滚动 */
.agr-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.agr-title {
  font-weight: 600;
}
.agr-publish-btn {
  float: right;
}
.agr-content {
  max-height: none;
  overflow: visible;
}
.agr-summary {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #ebeef5;
  color: #909399;
  font-size: 13px;
}
.agr-tip {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
.agreement-manage :deep(.el-table) {
  font-size: 14px;
}
.agreement-manage :deep(.el-table th.el-table__cell) {
  font-weight: 600;
}
</style>
