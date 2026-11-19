<template>
  <div class="model-config">
    <el-card shadow="never">
      <template #header>
        <div class="mc-header">
          <span class="mc-title">AI 模型配置</span>
          <div class="mc-actions">
            <!-- 类型筛选：字典下拉（ai_model_type），与全站筛选控件口径一致（反馈页同款）。
                 ⚠️ 这里原先用 el-radio-button，但 element-plus/es/components/radio/style/css.mjs
                 只聚合了 el-radio.css，漏掉 el-radio-button.css → 原生 <input type=radio> 的
                 隐藏样式（opacity:0）失效，圆点裸露、连体边框与间距全丢，糊成一坨挤在一起的字。
                 已改 DictSelect，并在 main.ts 补齐 element-plus 的 radio 样式。 -->
            <DictSelect
              v-model="typeFilter"
              type-code="ai_model_type"
              placeholder="全部类型"
              class="filter-select"
            />
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
              v-if="ttsEnabled"
              type="success"
              plain
              @click="openTtsTest"
            >语音测试</el-button>
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
          密钥入库即加密（复用 AI_KEK，SM4-GCM，enc:v1: 前缀），本页仅回显「是否已配置」标记，绝不展示明文 / 密文。
          模型类型分 chat / embedding / rerank / tts，同一供应商可在不同类型下各存一行；每类型各有一条「启用」行生效。
        </template>
      </el-alert>

      <el-table :data="filteredList" v-loading="loading" border stripe class="mc-table">
        <el-table-column prop="modelType" label="类型" width="130">
          <template #default="{ row }">
            <el-tag :type="modelTypeTagType(row.modelType) || 'info'" effect="dark">
              {{ modelTypeLabel(row.modelType) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="provider" label="供应商" width="130">
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
        <!-- 排序（V215）：与菜单管理页同款交互——显示 sort_no + 上移/下移。
             顺序只影响本页展示，不影响运行期生效行（is_active 决定）。 -->
        <el-table-column label="排序" width="150" align="center">
          <template #default="{ row }">
            <span class="sort-no">{{ row.sortNo }}</span>
            <el-button
              v-has-perm="['sys:modelConfig:edit']"
              link
              type="primary"
              size="small"
              :disabled="sorting || !canMove(row, -1)"
              @click="move(row, -1)"
            >上移</el-button>
            <el-button
              v-has-perm="['sys:modelConfig:edit']"
              link
              type="primary"
              size="small"
              :disabled="sorting || !canMove(row, 1)"
              @click="move(row, 1)"
            >下移</el-button>
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
              <el-tooltip
                v-if="row.extraSet"
                content="扩展参数已配置：TTS 的音色/格式/采样率、Embedding 的向量维度等。点击「编辑」查看与修改。"
                placement="top"
              >
                <span>附加: <el-tag size="small" type="success">已配置</el-tag></span>
              </el-tooltip>
            </div>
          </template>
        </el-table-column>
        <el-table-column v-if="opVisible" label="操作" width="180" fixed="right">
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
        <el-form-item label="模型类型" prop="modelType">
          <DictSelect v-model="form.modelType" type-code="ai_model_type" placeholder="选择模型类型" :disabled="!!form.id" :clearable="false" />
        </el-form-item>
        <el-form-item label="供应商" prop="provider">
          <DictSelect v-model="form.provider" type-code="ai_provider" placeholder="选择供应商" :disabled="!!form.id" :clearable="false" />
        </el-form-item>
        <el-form-item label="Base URL" prop="baseUrl">
          <el-input v-model="form.baseUrl" :placeholder="baseUrlPlaceholder" />
        </el-form-item>
        <el-form-item :label="form.provider === 'coze' ? '模型 / BotId' : '模型名'" prop="model">
          <el-input
            v-model="form.model"
            :placeholder="modelPlaceholder"
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
        <!-- TTS 结构化参数：对应 extra_json 的 voice / format / sample_rate -->
        <template v-if="form.modelType === 'tts'">
          <el-form-item label="音色">
            <el-select v-model="ttsForm.voice" filterable placeholder="选择音色" @change="syncTtsToJson">
              <el-option v-for="v in TTS_VOICES" :key="v.value" :label="v.label" :value="v.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="音频格式">
            <el-select v-model="ttsForm.format" @change="syncTtsToJson">
              <el-option v-for="f in TTS_FORMATS" :key="f.value" :label="f.label" :value="f.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="采样率">
            <el-select v-model="ttsForm.sampleRate" @change="syncTtsToJson">
              <el-option v-for="s in TTS_SAMPLE_RATES" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
          </el-form-item>
        </template>

        <!-- Embedding 向量维度：只读。维度由 ES 索引结构决定，改了必须重建索引 -->
        <el-form-item v-if="form.modelType === 'embedding'" label="向量维度">
          <el-input :model-value="embeddingDims ?? '未配置'" disabled />
          <span class="mc-hint">维度由 ES 索引结构决定，修改需同步改 kb.embedding.dims 并重建索引，勿在此编辑</span>
        </el-form-item>

        <!-- 高级：原始 JSON。结构化表单的改动会同步到这里，用户可继续手改 -->
        <el-collapse class="mc-advanced">
          <el-collapse-item title="高级：附加参数 (JSON)" name="extra">
            <el-form-item label="附加参数(JSON)">
              <el-input
                v-model="form.extraJson"
                type="textarea"
                :rows="3"
                placeholder='如 {"temperature":0.2}；留空 = 保留已有配置'
              />
              <span class="mc-hint">保存时提交的是这里的完整 JSON；留空 = 保留库内已有配置</span>
            </el-form-item>
          </el-collapse-item>
        </el-collapse>
        <!-- 排序号（V215）：表单可直填。留空 = 新增自动排到末尾 / 编辑保持原值 -->
        <el-form-item label="排序号" prop="sortNo">
          <el-input-number
            v-model="form.sortNo"
            :min="1"
            :precision="0"
            :step="1"
            controls-position="right"
            placeholder="留空 = 排到最后"
            style="width: 200px"
          />
          <span class="mc-hint">数值越小越靠前；也可以直接用列表里的「上移 / 下移」调</span>
        </el-form-item>
        <el-form-item label="设为启用">
          <el-switch v-model="form.activeBool" />
          <span class="mc-hint">启用后成为该类型下的运行期生效配置（每类型唯一）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <!-- TTS 语音合成试听（V214，验证 tts 配置行是否真正可用） -->
    <el-dialog v-model="ttsDialogVisible" title="语音合成试听" width="520px" append-to-body>
      <el-alert type="info" :closable="false" show-icon class="mc-tip">
        <template #title>使用当前启用的 tts 模型合成语音。文本将发送给第三方（百炼），请勿输入敏感内容。</template>
      </el-alert>
      <el-input v-model="ttsText" type="textarea" :rows="3" maxlength="2000" show-word-limit
        placeholder="输入要合成的文本，如：您好，欢迎使用智能语音助手" />
      <div v-if="ttsAudioUrl" class="mc-audio">
        <audio :src="ttsAudioUrl" controls />
      </div>
      <template #footer>
        <el-button @click="ttsDialogVisible = false">关闭</el-button>
        <el-button type="primary" :loading="ttsSynthesizing" @click="doSynthesize">合成并试听</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Plus, Refresh, Edit, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import { useUserStore } from '@/stores/user'
import {
  listModelConfigs,
  createModelConfig,
  updateModelConfig,
  deleteModelConfig,
  reloadModelConfig,
  reorderModelConfigs,
  synthesizeTts,
  type ModelConfigMasked,
  type ModelConfigPayload,
} from '@/api/ai'
import DictSelect from '@/components/DictSelect.vue'
import { loadDictDefault, useDictLabels } from '@/composables/useDict'

// 操作列显隐（同 dict.vue 等页的既有实践）：编辑/删除共用同一权限点，
// 无权限时整列隐藏，不留一个永远空着的「操作」表头。
const userStore = useUserStore()
const opVisible = computed(() => userStore.hasAnyPerm(['sys:modelConfig:edit']))

const loading = ref(false)
const reloading = ref(false)
const saving = ref(false)
/** 排序请求进行中：禁止连点上移/下移（后端按整表顺序重写，连点会互相覆盖） */
const sorting = ref(false)
const list = ref<ModelConfigMasked[]>([])
const typeFilter = ref('')

const dialogVisible = ref(false)
const formRef = ref<FormInstance>()
// modelType / provider 的初值由字典默认项回填（见 dictDefaults），这里先留空
const form = reactive<ModelConfigPayload & { activeBool: boolean }>({
  id: undefined,
  modelType: '',
  provider: '',
  baseUrl: '',
  model: '',
  botId: '',
  apiKey: '',
  extraJson: '',
  active: 0,
  activeBool: false,
  sortNo: undefined,
})

const rules: FormRules = {
  modelType: [{ required: true, message: '请选择模型类型', trigger: 'change' }],
  provider: [{ required: true, message: '请选择供应商', trigger: 'change' }],
  baseUrl: [{ required: true, message: '请填写 Base URL', trigger: 'blur' }],
}

// 供应商中文名 / 标签颜色来自字典（替代硬编码）
const { label: providerLabel, style: providerTagType } = useDictLabels('ai_provider')
const { label: modelTypeLabel, style: modelTypeTagType } = useDictLabels('ai_model_type')

// ---------------------------------------------------------------- 新增表单默认值
// 虎哥 2026-11-18：新增配置的默认供应商不再写死 coze，改为取字典 ai_provider 的
// 「默认项」（is_default=1）；字典里没勾默认就留空，由管理员自己选。
// 模型类型同理走 ai_model_type 的默认项（当前种子默认 chat，行为与原来一致）。
// 运营以后想换默认供应商，只需在【字典管理 → AI供应商】里勾默认，不必改前端代码。
const dictDefaults = reactive({ modelType: '', provider: '' })
const dictDefaultsReady = Promise.all([
  loadDictDefault('ai_model_type'),
  loadDictDefault('ai_provider'),
]).then(([modelType, provider]) => {
  dictDefaults.modelType = modelType ?? ''
  dictDefaults.provider = provider ?? ''
})

// ---------------------------------------------------------------- TTS 结构化参数
// 音色清单取自百炼官方 cosyvoice-v3-flash 音色表（常用中文音色）。
// 对应 extra_json 的 voice / format / sample_rate 三个键。
const TTS_VOICES = [
  { value: 'longanyang', label: '龙安洋（阳光大男孩）' },
  { value: 'longanhuan', label: '龙安欢（欢脱元气女）' },
  { value: 'longxiaoxia', label: '龙小夏（沉稳权威女）' },
  { value: 'longxiaochun', label: '龙小淳（知性积极女）' },
  { value: 'longyumi', label: 'YUMI（正经青年女）' },
  { value: 'longanyun', label: '龙安昀（居家暖男）' },
  { value: 'longfei', label: '龙飞（热血磁性男）' },
  { value: 'longyingxiao', label: '龙应笑（清甜推销女）' },
  { value: 'longyingxun', label: '龙应询（年轻青涩男）' },
  { value: 'longyingjing', label: '龙应静（低调冷静女）' },
  { value: 'longyingling', label: '龙应聆（温和共情女）' },
  { value: 'longyingtao', label: '龙应桃（温柔淡定女）' },
  { value: 'longhuhu', label: '龙呼呼（天真烂漫女童）' },
  { value: 'longpaopao', label: '龙泡泡（飞天泡泡音）' },
  { value: 'longxian', label: '龙仙（豪放可爱女）' },
  { value: 'longling', label: '龙铃（稚气呆板女）' },
  { value: 'longshanshan', label: '龙闪闪（戏剧化童声）' },
  { value: 'longniuniu', label: '龙牛牛（阳光男童声）' },
  { value: 'longjiaxin', label: '龙嘉欣（粤语女）' },
  { value: 'longjiayi', label: '龙嘉怡（粤语女）' },
  { value: 'longanyue', label: '龙安粤（粤语男）' },
  { value: 'longlaotie', label: '龙老铁（东北话）' },
  { value: 'longshange', label: '龙陕哥（陕西话）' },
]
const TTS_FORMATS = [
  { value: 'mp3', label: 'mp3（默认，体积小）' },
  { value: 'wav', label: 'wav（无损）' },
  { value: 'pcm', label: 'pcm（原始音频）' },
  { value: 'opus', label: 'opus（低延迟）' },
]
const TTS_SAMPLE_RATES = [
  { value: '22050', label: '22050 Hz（默认）' },
  { value: '24000', label: '24000 Hz' },
  { value: '16000', label: '16000 Hz' },
  { value: '8000', label: '8000 Hz' },
]

// TTS 结构化表单状态（值最终写回 form.extraJson）
const ttsForm = reactive({ voice: 'longanyang', format: 'mp3', sampleRate: '22050' })
// Embedding 向量维度（只读展示）
const embeddingDims = ref<number | null>(null)

/** 安全解析 extra JSON；非法/非对象一律当空对象 */
function parseExtraObj(json?: string): Record<string, unknown> {
  if (!json) return {}
  try {
    const o = JSON.parse(json)
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/**
 * 结构化表单 → extra JSON（单向同步）。
 *
 * <p>刻意做成单向：用户在「高级 JSON」里手改的内容不会被结构化表单覆盖，
 * 避免两个入口互相打架、用户不知道自己改的是哪个。反向（JSON → 表单）不做。</p>
 */
function syncTtsToJson() {
  const base = parseExtraObj(form.extraJson)
  base.voice = ttsForm.voice
  base.format = ttsForm.format
  base.sample_rate = Number(ttsForm.sampleRate)
  form.extraJson = JSON.stringify(base)
}

/** 编辑时把后端回显的 extra 明文回填到结构化表单 */
function applyExtra(extraJson?: string | null) {
  const o = parseExtraObj(extraJson || undefined)
  if (typeof o.voice === 'string') ttsForm.voice = o.voice
  if (typeof o.format === 'string') ttsForm.format = o.format
  const sr = o.sample_rate ?? o.sampleRate
  if (sr != null && sr !== '') ttsForm.sampleRate = String(sr)
  if (o.dims != null) embeddingDims.value = Number(o.dims)
}

// 类型筛选（前端本地过滤，接口一次性返回全部）
const filteredList = computed(() =>
  typeFilter.value ? list.value.filter((r) => r.modelType === typeFilter.value) : list.value,
)

// ---------------------------------------------------------------- 排序（V215）
/** 相邻关系按「当前视图」判断：筛选后首行不能上移、末行不能下移 */
function canMove(row: ModelConfigMasked, dir: -1 | 1): boolean {
  const view = filteredList.value
  const idx = view.findIndex((r) => r.id === row.id)
  if (idx < 0) return false
  return dir < 0 ? idx > 0 : idx < view.length - 1
}

/**
 * 上移 / 下移。
 *
 * <p>交换的是「全量列表」里两行的位置，再提交完整 id 顺序：类型筛选只是隐藏行，
 * 库里的顺序是整表的——在整表里互换这两行，视觉上就是筛选视图里换了个位置，
 * 而且不会打乱其它类型的行。</p>
 *
 * <p>提交后按后端同一算法（index+1，1..N 连续）本地预演 sort_no，省一次刷新请求，
 * 也保证「界面上显示的序号」和库里落的一致；失败则重新拉取。</p>
 */
async function move(row: ModelConfigMasked, dir: -1 | 1) {
  const view = filteredList.value
  const idx = view.findIndex((r) => r.id === row.id)
  const neighbor = idx >= 0 ? view[idx + dir] : undefined
  if (!neighbor) return

  const next = [...list.value]
  const i = next.findIndex((r) => r.id === row.id)
  const j = next.findIndex((r) => r.id === neighbor.id)
  ;[next[i], next[j]] = [next[j], next[i]]
  next.forEach((r, k) => { r.sortNo = k + 1 })
  list.value = next

  sorting.value = true
  try {
    await reorderModelConfigs(next.map((r) => r.id))
  } catch (e: any) {
    ElMessage.error(e?.message || '调整顺序失败')
    // 失败（多半是别人同时增删了配置）：库里顺序未知，直接重拉覆盖本地乐观结果
    await load()
  } finally {
    sorting.value = false
  }
}

// TTS 试听：仅当存在启用的 tts 配置行时显示入口
const ttsEnabled = computed(() =>
  list.value.some((r) => r.modelType === 'tts' && r.active === 1 && r.apiKeySet),
)
const ttsDialogVisible = ref(false)
const ttsText = ref('您好，欢迎使用智能语音助手')
const ttsSynthesizing = ref(false)
const ttsAudioUrl = ref('')

function openTtsTest() {
  ttsText.value = '您好，欢迎使用智能语音助手'
  if (ttsAudioUrl.value) {
    URL.revokeObjectURL(ttsAudioUrl.value)
    ttsAudioUrl.value = ''
  }
  ttsDialogVisible.value = true
}

async function doSynthesize() {
  if (!ttsText.value.trim()) {
    ElMessage.warning('请输入要合成的文本')
    return
  }
  ttsSynthesizing.value = true
  try {
    const res = await synthesizeTts({ text: ttsText.value })
    const bin = atob(res.audioBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const blob = new Blob([bytes], { type: res.contentType || 'audio/mpeg' })
    if (ttsAudioUrl.value) URL.revokeObjectURL(ttsAudioUrl.value)
    ttsAudioUrl.value = URL.createObjectURL(blob)
    ElMessage.success(`合成成功（${res.bytes} 字节，${res.format}）`)
  } catch (e: any) {
    ElMessage.error(e?.message || '语音合成失败')
  } finally {
    ttsSynthesizing.value = false
  }
}

// 按类型切换 Base URL / 模型名占位提示，降低填错概率
const baseUrlPlaceholder = computed(() => {
  switch (form.modelType) {
    case 'embedding':
    case 'rerank':
      return '百炼兼容模式: https://dashscope.aliyuncs.com/compatible-mode/v1'
    case 'tts':
      return '百炼 WebSocket: wss://dashscope.aliyuncs.com/api-ws/v1/inference'
    default:
      // 不把 coze 摆在第一位：默认供应商改成字典驱动后，提示语也按「通用 OpenAI 兼容」写
      return 'OpenAI 兼容: https://api.openai.com/v1；DeepSeek: https://api.deepseek.com；Ollama: http://127.0.0.1:11434'
  }
})
const modelPlaceholder = computed(() => {
  switch (form.modelType) {
    case 'embedding': return '如 text-embedding-v3'
    case 'rerank': return '如 text-rerank'
    case 'tts': return '如 cosyvoice-v3-flash'
    default:
      return form.provider === 'coze' ? 'Coze 填 BotId（也可填在下方 BotId 字段）' : '如 deepseek-chat / gpt-4o / glm-4'
  }
})

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
  // 默认值来自字典默认项（见 dictDefaults）；没有默认项 → 空，用户自己选
  form.modelType = dictDefaults.modelType
  form.provider = dictDefaults.provider
  form.baseUrl = ''
  form.model = ''
  form.botId = ''
  form.apiKey = ''
  form.extraJson = ''
  form.active = 0
  form.activeBool = false
  form.sortNo = undefined
  ttsForm.voice = 'longanyang'
  ttsForm.format = 'mp3'
  ttsForm.sampleRate = '22050'
  embeddingDims.value = null
  formRef.value?.clearValidate()
}

async function openCreate() {
  // 等字典默认项就绪再开弹窗：否则首屏刚进就点「新增」会拿到空默认值
  await dictDefaultsReady
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: ModelConfigMasked) {
  resetForm()
  form.id = row.id
  form.modelType = row.modelType
  form.provider = row.provider
  form.baseUrl = row.baseUrl || ''
  form.model = row.model || ''
  form.activeBool = row.active === 1
  form.active = row.active
  // 排序号回显：编辑时可改；清空提交 = 保持原值
  form.sortNo = row.sortNo
  // extra 回显明文（配置参数非密钥）：结构化表单需要原值才能正确回填并 merge
  form.extraJson = row.extraJson || ''
  applyExtra(row.extraJson)
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
      modelType: form.modelType,
      provider: form.provider,
      baseUrl: form.baseUrl,
      model: form.model,
      botId: form.provider === 'coze' ? form.botId || undefined : undefined,
      apiKey: form.apiKey || undefined,
      extraJson: form.extraJson || undefined,
      active: form.activeBool ? 1 : 0,
      sortNo: form.sortNo ?? undefined,
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
    await ElMessageBox.confirm(
      `确认删除该模型配置（类型=${modelTypeLabel(row.modelType)}，供应商=${providerLabel(row.provider)}）？`,
      '删除确认',
      { type: 'warning' },
    )
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
/* 操作区：筛选下拉 + 按钮组。按钮间距仍由 EP 的 .el-button + .el-button{margin-left:12px} 提供，
   flex 只负责垂直居中与消除 inline-block 的换行风险。 */
.mc-actions {
  display: flex;
  align-items: center;
}
/* 下拉与后面的「新增配置」按钮之间补 12px —— EP 的相邻按钮 margin 规则只覆盖 button+button，
   下拉与按钮相邻时没有间距；flex:none 保证 200px 宽不被压缩。
   用 :deep() 而非直接 .filter-select —— 后者要靠「子组件根节点继承父 scope id」才命中，
   :deep() 不依赖这条隐含规则（feedback.vue 同一处也是 :deep 写法）。 */
.mc-actions :deep(.filter-select) {
  margin-right: 12px;
  flex: none;
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
/* 排序号：与「上移/下移」文字按钮同行，弱化显示（与菜单管理页 .sort-no 一致） */
.sort-no {
  display: inline-block;
  min-width: 28px;
  margin-right: 4px;
  color: #606266;
}
.mc-hint {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}
/* 高级 JSON 折叠区：默认收起，不喧宾夺主 */
.mc-advanced {
  margin: 8px 0;
}
.mc-advanced :deep(.el-collapse-item__header) {
  font-size: 13px;
  color: #909399;
}
.mc-advanced :deep(.el-collapse-item__content) {
  padding-bottom: 0;
}
.mc-audio {
  margin-top: 16px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
}
.mc-audio audio {
  width: 100%;
}
</style>
