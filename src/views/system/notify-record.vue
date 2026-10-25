<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { listRecords, listTemplates, publishNotification } from '@/api/notification'
import { listUserOptions } from '@/api/user'
import type { UserOptionVO } from '@/types/user'
import type { NotificationVO } from '@/types/notification'
import { LEVEL_LABELS, isValidLink, templateLabel } from '@/types/notification'

defineOptions({ name: 'notify-record' })

const loading = ref(false)
const records = ref<NotificationVO[]>([])
const templates = ref<{ code: string; templateName: string; type: string; titleTpl: string }[]>([])
const router = useRouter()

// ===== 筛选 =====
const filters = reactive({
  type: '',
  receiver: '',
  range: [] as string[],
})

// ===== 分页（默认每页 10 条，el-pagination 标准分页器，同 user.vue 规格）=====
const pageNum = ref(1)
const pageSize = ref(10)
const total = ref(0)

async function load() {
  loading.value = true
  try {
    const page = await listRecords({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      type: filters.type || undefined,
      receiver: filters.receiver.trim() || undefined,
      from: filters.range?.[0] ? `${filters.range[0]} 00:00:00` : undefined,
      to: filters.range?.[1] ? `${filters.range[1]} 23:59:59` : undefined,
    })
    records.value = page.records
    total.value = page.total
  } catch {
    ElMessage.error('加载记录失败')
  } finally {
    loading.value = false
  }
}

/** 查询：条件变化回到第一页（否则可能停在一个不存在的页码上） */
function handleQuery() {
  pageNum.value = 1
  load()
}

/** 切换每页条数：回到第一页再拉 */
function handleSizeChange() {
  pageNum.value = 1
  load()
}

function resetFilters() {
  filters.type = ''
  filters.receiver = ''
  filters.range = []
  pageNum.value = 1
  load()
}

/** 类型中文名：通知记录只存模板 type 码（如 APPROVAL_TODO），
 *  用模板列表映射成 V31 后的中文名；无匹配兜底显示原始码 */
function typeLabel(type: string): string {
  if (!type) return '-'
  const t = templates.value.find((x) => x.type === type || x.code === type)
  return t ? templateLabel(t) : type
}

/** 已读判定：后端 records VO 化后读 read；兼容部署前的实体返回（只有 readAt） */
function isRead(r: NotificationVO): boolean {
  return r.read === true || !!(r as NotificationVO & { readAt?: string | null }).readAt
}

// ===== 多人发布聚合（方案 A：纯前端分组，2026-10-20 虎哥拍板）=====
// 事实表「一人一条」是 dedup/独立已读的刻意设计；管理端按
// 「模板 type + 标题 + 落库时间」把同一次发布的多行折叠成一条汇总，
// 展开看每个收件人的已读明细。零后端零迁移。
interface NotifyGroup {
  key: string
  type: string
  title: string
  level: string
  createdAt: string
  /** 收件人数（组内行数） */
  total: number
  /** 组内已读数 */
  readCount: number
  rows: NotificationVO[]
}

const groups = computed<NotifyGroup[]>(() => {
  const map = new Map<string, NotifyGroup>()
  for (const r of records.value) {
    const key = `${r.type}|${r.title}|${r.createdAt}`
    let g = map.get(key)
    if (!g) {
      g = {
        key,
        type: r.type,
        title: r.title,
        level: r.level,
        createdAt: r.createdAt,
        total: 0,
        readCount: 0,
        rows: [],
      }
      map.set(key, g)
    }
    g.total += 1
    if (isRead(r)) g.readCount += 1
    g.rows.push(r)
  }
  return [...map.values()]
})

onMounted(async () => {
  load()
  try {
    const list = await listTemplates()
    templates.value = list.map((t) => ({ code: t.code, templateName: t.templateName, type: t.type, titleTpl: t.titleTpl }))
  } catch {
    // 模板列表失败不阻塞记录页（发布弹层仍可直接发文案）
  }
})

// ===== 发布弹层 =====
const pubDialog = ref(false)
const publishing = ref(false)
const userOptions = ref<UserOptionVO[]>([])
const pub = reactive({
  code: '',
  title: '',
  content: '',
  linkUrl: '',
  level: 'INFO',
  receivers: [] as number[],
})

async function openPublish() {
  pub.code = ''
  pub.title = ''
  pub.content = ''
  pub.linkUrl = ''
  pub.level = 'INFO'
  pub.receivers = []
  pubDialog.value = true
  if (userOptions.value.length === 0) {
    try {
      userOptions.value = await listUserOptions()
    } catch {
      ElMessage.error('加载用户列表失败')
    }
  }
}

async function submitPublish() {
  if (pub.receivers.length === 0) {
    ElMessage.warning('请选择收件人')
    return
  }
  const useTemplate = !!pub.code
  if (!useTemplate && !pub.title.trim()) {
    ElMessage.warning('标题不能为空')
    return
  }
  // 跳转链接：站内路径（/ 开头）或 http(s):// 外链，正则校验（后端同规则再校一道）
  if (pub.linkUrl && !isValidLink(pub.linkUrl)) {
    ElMessage.warning('跳转链接不合法：需为站内路径（以 / 开头）或 http(s):// 外链地址')
    return
  }
  publishing.value = true
  try {
    const { inserted } = await publishNotification({
      code: useTemplate ? pub.code : undefined,
      title: useTemplate ? undefined : pub.title,
      content: useTemplate ? undefined : pub.content,
      linkUrl: pub.linkUrl || undefined,
      level: pub.level,
      receivers: pub.receivers,
    })
    ElMessage.success(`已发布（实际入库 ${inserted} 条，收件人将实时收到）`)
    pubDialog.value = false
    load()
  } catch {
    ElMessage.error('发布失败')
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="page-card">
    <div class="page-head">
      <div>
        <h3 class="page-title">通知记录</h3>
      </div>
      <div class="head-actions">
        <el-button @click="router.push('/system/notify-template')">通知模板</el-button>
        <el-button type="primary" @click="openPublish">发布通知</el-button>
      </div>
    </div>

    <el-form :inline="true" :model="filters" class="query-bar" @submit.prevent>
      <el-form-item label="类型">
        <el-select v-model="filters.type" placeholder="全部" clearable>
          <el-option v-for="t in templates" :key="t.code" :label="templateLabel(t)" :value="t.type" />
        </el-select>
      </el-form-item>
      <el-form-item label="收件人">
        <el-input
          v-model="filters.receiver"
          placeholder="用户名 / 昵称"
          clearable
          @keyup.enter="load"
        />
      </el-form-item>
      <el-form-item label="创建时间">
        <el-date-picker
          v-model="filters.range"
          type="daterange"
          range-separator="~"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </el-form-item>
    </el-form>

    <!-- 聚合视图：一次发布折叠一条（收件人数/已读进度），展开看每人明细 -->
    <el-table v-loading="loading" :data="groups" border stripe row-key="key">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="notify-sub">
            <div v-for="r in row.rows" :key="r.id" class="notify-sub-item">
              <span class="sub-id">#{{ r.id }}</span>
              <span class="sub-receiver">收件人：{{ r.receiverName || `ID:${r.receiverId}` }}</span>
              <el-tag :type="isRead(r) ? 'info' : 'success'" size="small">
                {{ isRead(r) ? '已读' : '未读' }}
              </el-tag>
              <span class="sub-time">{{ r.createdAt ? r.createdAt.replace('T', ' ') : '-' }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="type" label="类型名称" width="160">
        <template #default="{ row }">
          <span :title="row.type">{{ typeLabel(row.type) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="title" label="标题" min-width="120" show-overflow-tooltip />
      <el-table-column label="内容" min-width="300" show-overflow-tooltip>
        <template #default="{ row }">
          {{ row.rows[0]?.content || '—' }}
        </template>
      </el-table-column>
      <el-table-column label="收件人" width="100" align="center">
        <template #default="{ row }">
          {{ row.total }} 人
        </template>
      </el-table-column>
      <el-table-column label="级别" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="row.level === 'URGENT' ? 'danger' : row.level === 'WARN' ? 'warning' : 'info'" size="small">
            {{ LEVEL_LABELS[row.level] || row.level }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="已读" width="110" align="center">
        <template #default="{ row }">
          <el-tag :type="row.readCount === row.total ? 'info' : 'warning'" size="small">
            {{ row.readCount }}/{{ row.total }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">
          {{ row.createdAt ? row.createdAt.replace('T', ' ') : '-' }}
        </template>
      </el-table-column>
    </el-table>

    <!-- 标准分页器：默认每页 10 条，与后端默认值一致（同 user.vue 规格） -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="pageNum"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        @current-change="load"
        @size-change="handleSizeChange"
      />
    </div>

    <el-dialog v-model="pubDialog" title="发布通知" width="640px">
      <el-form label-width="90px">
        <el-form-item label="发送方式">
          <el-select v-model="pub.code" placeholder="直接文案" clearable>
            <el-option v-for="t in templates" :key="t.code" :label="templateLabel(t)" :value="t.code" />
          </el-select>
        </el-form-item>
        <template v-if="!pub.code">
          <el-form-item label="标题">
            <el-input v-model="pub.title" maxlength="128" show-word-limit />
          </el-form-item>
          <el-form-item label="正文">
            <el-input v-model="pub.content" type="textarea" :rows="4" maxlength="1024" show-word-limit />
          </el-form-item>
        </template>
        <el-form-item label="跳转链接">
          <el-input v-model="pub.linkUrl" placeholder="站内路径如 /approval，或外链 https://example.com" />
        </el-form-item>
        <el-form-item label="级别">
          <el-select v-model="pub.level" placeholder="INFO">
            <el-option v-for="(label, value) in LEVEL_LABELS" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="收件人">
          <el-select
            v-model="pub.receivers"
            multiple
            filterable
            placeholder="选择收件人（可多选）"
            style="width: 100%"
          >
            <el-option v-for="u in userOptions" :key="u.id" :label="u.nickname" :value="u.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pubDialog = false">取消</el-button>
        <el-button type="primary" :loading="publishing" @click="submitPublish">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page-card {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 16px;
}
.page-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
/* 查询栏与系统其他页面保持同一套规格：el-form.query-bar，
   控件宽度由 pages.css 统一收口（input/select 200px、daterange 300px），
   此处只补下边距（同 user.vue / role.vue / menu.vue 的 4px） */
/* 页头右侧按钮组：flex + gap 0（间距由 EP 按钮自带 margin-left 提供，叠 gap 会双倍，
   同系统 toolbar 规格，见 dict.vue 注释） */
.head-actions {
  display: flex;
  gap: 0;
}
.query-bar {
  margin-bottom: 4px;
}
/* 标准分页器右对齐（同 user.vue 规格） */
/* .pagination-bar 已上提到 styles/pages.css 全局（2026-10-26），本文件不再留本地副本 */
/* 聚合展开的收件人明细（每条发布下的每人已读态） */
.notify-sub {
  padding: 6px 16px 8px 48px;
  background: #fafafa;
}
.notify-sub-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  font-size: 12px;
  color: #606266;
  border-bottom: 1px dashed #f0f0f0;
}
.notify-sub-item:last-child {
  border-bottom: none;
}
.sub-id {
  color: #909399;
  font-family: Consolas, Monaco, monospace;
}
.sub-receiver {
  min-width: 130px;
}
.sub-time {
  margin-left: auto;
  color: #909399;
}
</style>
