<template>
  <div class="model-config">
    <el-card shadow="never">
      <template #header>
        <div class="mc-header">
          <span class="mc-title">AI 模型配置</span>
          <div class="mc-actions">
            <el-button
              v-has-perm="['sys:modelConfig:edit']"
              type="primary"
              :icon="Plus"
              @click="openCreate"
            >新增配置</el-button>
            <el-button
              :icon="Refresh"
              :loading="loading"
              @click="load"
            >刷新</el-button>
            <el-button
              v-has-perm="['sys:modelConfig:edit']"
              :icon="Refresh"
              :loading="reloading"
              @click="doReload"
            >热重载</el-button>
          </div>
        </div>
      </template>

      <el-alert type="info" :closable="false" show-icon class="mc-tip">
        <template #title>
          密钥入库即加密（SM4-GCM，enc:v1: 前缀），本页仅回显「是否已配置」标记，绝不展示明文 / 密文。
          使某一行「启用」后运行期即热切换供应商，无需重启。
        </template>
      </el-alert>

      <el-table :data="list" v-loading="loading" border stripe class="mc-table">
        <el-table-column prop="provider" label="供应商" width="120">
          <template #default="{ row }">
            <el-tag :type="providerTagType(row.provider) || 'info'">
              {{ providerLabel(row.provider) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.active === 1" type="success">启用</el-tag>
            <el-tag v-else type="info">停用</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="baseUrl" label="Base URL" min-width="200" show-overflow-tooltip />
        <el-table-column prop="model" label="模型 / Bot" min-width="140" show-overflow-tooltip />
        <el-table-column label="凭证状态" min-width="280">
          <template #default="{ row }">
            <!-- 凭证状态：coze 行仅显示 BotId + ApiKey；非 coze 行 BotId 由 v-if 隐藏，只剩 ApiKey。
                 用显式 inline-flex 容器（不依赖 el-space 的注册时机），强制单行 + 16px 自然间距。 -->
            <div style="display:inline-flex;align-items:center;gap:16px;white-space:nowrap">
              <span v-if="row.provider === 'coze'">BotId: <el-tag size="small" :type="row.botIdSet ? 'success' : 'info'">{{ row.botIdSet ? '已配置' : '未配置' }}</el-tag></span>
              <span>ApiKey: <el-tag size="small" :type="row.apiKeySet ? 'success' : 'info'">{{ row.apiKeySet ? '已配置' : '未配置' }}</el-tag></span>
              <span v-if="row.extraSet">附加: <el-tag size="small" type="success">已配置</el-tag></span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-has-perm="['sys:modelConfig:edit']"
              link type="primary" :icon="Edit" @click="openEdit(row)"
            >编辑</el-button>
            <el-button
              v-has-perm="['sys:modelConfig:edit']"
              link type="danger" :icon="Delete" @click="remove(row)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增 / 编辑对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="form.id ? '编辑模型配置' : '新增模型配置'"
      width="560px"
      append-to-body
      @closed="resetForm"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="供应商" prop="provider">
          <DictSelect v-model="form.provider" type-code="ai_provider" placeholder="选择供应商" :disabled="!!form.id" :clearable="false" />
        </el-form-item>
        <el-form-item label="Base URL" prop="baseUrl">
          <el-input v-model="form.baseUrl" placeholder="Coze: https://api.coze.cn；DeepSeek/OpenAI 兼容: https://api.deepseek.com（代码自动拼 /chat/completions）" />
        </el-form-item>
        <el-form-item :label="form.provider === 'coze' ? '模型 / BotId' : '模型名'" prop="model">
          <el-input
            v-model="form.model"
            :placeholder="form.provider === 'coze' ? 'Coze 填 BotId（也可填在下方 BotId 字段）' : '如 deepseek-chat / gpt-4o / glm-4'"
          />
        </el-form-item>
        <el-form-item v-if="form.provider === 'coze'" label="BotId">
          <el-input
            v-model="form.botId"
            type="password"
            show-password
            placeholder="Coze 机器人 ID；留空 = 保留已有配置"
          />
        </el-form-item>
        <el-form-item label="ApiKey">
          <el-input
            v-model="form.apiKey"
            type="password"
            show-password
            placeholder="PAT / API Key；留空 = 保留已有配置"
          />
        </el-form-item>
        <el-form-item label="附加参数(JSON)">
          <el-input v-model="form.extraJson" type="textarea" :rows="2" placeholder='可选，如 {"temperature":0.2}' />
        </el-form-item>
        <el-form-item label="设为启用">
          <el-switch v-model="form.activeBool" />
          <span class="mc-hint">启用后该供应商成为运行期生效配置（全局唯一）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { Plus, Refresh, Edit, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import {
  listModelConfigs,
  createModelConfig,
  updateModelConfig,
  deleteModelConfig,
  reloadModelConfig,
  type ModelConfigMasked,
  type ModelConfigPayload,
} from '@/api/ai'
import DictSelect from '@/components/DictSelect.vue'
import { useDictLabels } from '@/composables/useDict'

const loading = ref(false)
const reloading = ref(false)
const saving = ref(false)
const list = ref<ModelConfigMasked[]>([])

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
const form = reactive<ModelConfigPayload & { activeBool: boolean }>({
  id: undefined,
  provider: 'coze',
  baseUrl: '',
  model: '',
  botId: '',
  apiKey: '',
  extraJson: '',
  active: 0,
  activeBool: false,
})

const rules: FormRules = {
  provider: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  baseUrl: [{ required: true, message: '请填写 Base URL', trigger: 'blur' }],
}

// 供应商中文名 / 标签颜色来自字典 ai_provider（替代硬编码 providerLabel）
const { label: providerLabel, style: providerTagType } = useDictLabels('ai_provider')

// 切走 Coze 时清空 BotId（该字段仅 Coze 使用，避免残留值误提交）
watch(
  () => form.provider,
  (p) => {
    if (p !== 'coze') form.botId = ''
  },
)

async function load() {
  loading.value = true
  try {
    list.value = await listModelConfigs()
  } catch (e: any) {
    ElMessage.error(e?.message || '加载配置失败')
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.id = undefined
  form.provider = 'coze'
  form.baseUrl = ''
  form.model = ''
  form.botId = ''
  form.apiKey = ''
  form.extraJson = ''
  form.active = 0
  form.activeBool = false
  formRef.value?.clearValidate()
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: ModelConfigMasked) {
  resetForm()
  form.id = row.id
  form.provider = row.provider
  form.baseUrl = row.baseUrl || ''
  form.model = row.model || ''
  form.activeBool = row.active === 1
  form.active = row.active
  // botId / apiKey 故意清空：编辑时留空 = 沿用库内已有密文
  dialogVisible.value = true
}

async function submit() {
  if (!formRef.value) return
  await formRef.value.validate(async (ok) => {
    if (!ok) return
    saving.value = true
    const payload: ModelConfigPayload = {
      id: form.id,
      provider: form.provider,
      baseUrl: form.baseUrl,
      model: form.model,
      botId: form.provider === 'coze' ? form.botId || undefined : undefined,
      apiKey: form.apiKey || undefined,
      extraJson: form.extraJson || undefined,
      active: form.activeBool ? 1 : 0,
    }
    try {
      if (form.id) {
        await updateModelConfig(payload)
        ElMessage.success('已更新')
      } else {
        await createModelConfig(payload)
        ElMessage.success('已新增')
      }
      dialogVisible.value = false
      await load()
    } catch (e: any) {
      ElMessage.error(e?.message || '保存失败')
    } finally {
      saving.value = false
    }
  })
}

async function remove(row: ModelConfigMasked) {
  try {
    await ElMessageBox.confirm(`确认删除该模型配置（供应商=${providerLabel(row.provider)}）？`, '删除确认', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteModelConfig(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '删除失败')
  }
}

async function doReload() {
  reloading.value = true
  try {
    await reloadModelConfig()
    ElMessage.success('已触发热重载，运行期配置已刷新')
  } catch (e: any) {
    ElMessage.error(e?.message || '热重载失败')
  } finally {
    reloading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.mc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.mc-title {
  font-size: 16px;
  font-weight: 600;
}
.mc-tip {
  margin-bottom: 12px;
}
.mc-table {
  margin-top: 4px;
}
.mc-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
</style>
