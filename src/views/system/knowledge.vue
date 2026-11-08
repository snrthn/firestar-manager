<script setup lang="ts">
/**
 * AI 中心 → 知识库（V207 菜单 9503，/system/knowledge，component=system/knowledge）
 *
 * ⚠️ 当前是「步骤 4 能力落地页」，**后端 KB CRUD 接口尚未实现**：
 *    V206/V207 只落了字典与三张表 / 菜单 / 权限，Controller + Service 属于下一轮
 *    （文档 §8 补的 4.5 切面）。因此本页数据是本地内存态，保存只做校验不持久化，
 *    发布按钮禁用。这样菜单不再是 PagePlaceholder，同时不谎报「功能已可用」。
 *
 * 本页可实际验证的三件事（§8 步骤 4 验收点）：
 *   ① MarkdownEditor：工具栏编辑、图片上传走 /files/upload（真实接口，bizType=kb_doc、
 *      不带 classify → ATTACHMENT），正文回写 ![name](file:<id>)；
 *   ② MarkdownView：统一渲染管线，禁 raw HTML、外链图片被拦、file: 换 JWT blob URL；
 *   ③ validateMarkdown / collectFileRefs / extractHeadings：保存前规范校验与出处锚点。
 */
import { computed, defineAsyncComponent, reactive, ref } from 'vue'
import { Plus, Delete, View, EditPen } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus/es/components/message/index.mjs'
import ElMessageBox from 'element-plus/es/components/message-box/index.mjs'
import MarkdownView from '@/components/MarkdownView.vue'

// ⚠️ 编辑器必须异步加载：md-editor-v3 把 CodeMirror / mermaid / katex 的引用
//    带进编辑器 chunk（noMermaid/noKatex 只是运行时开关，tree-shake 不掉），实测
//    knowledge 页 chunk 达 1.01MB / gzip 360KB。改成 defineAsyncComponent 后
//    编辑器单独成 chunk，只有切到「编辑」态才下载；预览/列表态零负担。
//    不用 loadingComponent 的 template 选项：本项目是 runtime-only Vue，模板不会编译。
const MarkdownEditor = defineAsyncComponent(() => import('@/components/MarkdownEditor.vue'))
import { validateMarkdown, collectFileRefs, extractHeadings } from '@/utils/markdown'

interface KbDocItem {
  id: number
  title: string
  summary: string
  contentMd: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  version: number
}

const SAMPLE = [
  '# 差旅费报销制度',
  '',
  '> 本文档用于验证知识库 Markdown 渲染与切片规范，内容为示例。',
  '',
  '## 适用范围',
  '',
  '适用于全体员工的境内差旅费用报销。',
  '',
  '| 城市级别 | 住宿限额（元/晚） | 市内交通 |',
  '|---|---|---|',
  '| 一线城市 | 500 | 80 |',
  '| 其他城市 | 350 | 50 |',
  '',
  '## 报销流程',
  '',
  '### 提交材料',
  '',
  '1. 发票原件',
  '2. 行程单',
  '3. 审批通过的出差申请',
  '',
  '### 时限要求',
  '',
  '出差结束后 15 个工作日内提交。',
  '',
  '下面这行是**故意放的外链图片**，应被渲染管线拦成可见占位：',
  '',
  '![外链示意](https://example.com/not-allowed.png)',
].join('\n')

let nextId = 2
const docs = ref<KbDocItem[]>([
  {
    id: 1,
    title: '差旅费报销制度',
    summary: '境内差旅住宿与交通标准、报销流程与时限',
    contentMd: SAMPLE,
    status: 'DRAFT',
    version: 1,
  },
])
const currentId = ref(1)
const mode = ref<'edit' | 'preview'>('edit')
const form = reactive({ title: '', summary: '', contentMd: '' })

function loadDoc(item: KbDocItem) {
  currentId.value = item.id
  form.title = item.title
  form.summary = item.summary
  form.contentMd = item.contentMd
  mode.value = 'edit'
}
loadDoc(docs.value[0])

const current = computed(() => docs.value.find((d) => d.id === currentId.value) ?? null)
const issues = computed(() => validateMarkdown(form.contentMd))
const headings = computed(() => extractHeadings(form.contentMd))
const fileRefs = computed(() => collectFileRefs(form.contentMd))

function openCreate() {
  const item: KbDocItem = {
    id: nextId++,
    title: '未命名文档',
    summary: '',
    contentMd: '# 未命名文档\n\n## 章节\n\n正文',
    status: 'DRAFT',
    version: 1,
  }
  docs.value.unshift(item)
  loadDoc(item)
}

async function removeDoc() {
  if (!current.value) return
  await ElMessageBox.confirm(`确认删除「${current.value.title}」？`, '提示', { type: 'warning' })
  docs.value = docs.value.filter((d) => d.id !== currentId.value)
  if (docs.value.length) loadDoc(docs.value[0])
  else {
    currentId.value = 0
    form.title = ''
    form.summary = ''
    form.contentMd = ''
  }
}

/** 保存：本轮只做校验与本地态更新，不调后端（接口待接入） */
function save() {
  if (issues.value.length) {
    ElMessage.warning(`MD 规范未通过：${issues.value[0].message}`)
    return
  }
  const item = current.value
  if (!item) return
  item.title = form.title.trim() || '# 未命名文档'
  item.summary = form.summary.trim()
  item.contentMd = form.contentMd
  ElMessage.success('校验通过并已更新本地草稿（后端 KB 接口待接入，未持久化）')
}
</script>

<template>
  <div class="knowledge-page">
    <el-alert type="warning" :closable="false" show-icon class="kb-tip">
      <template #title>
        知识库管理端 · 能力落地页：MD 编辑器、统一渲染管线与图片协议已就绪；
        <b>后端 KB CRUD 接口尚未实现</b>（V206/V207 只落了字典、三张表与菜单权限）。
        当前文档为本地内存态，保存仅做校验、不持久化，发布暂不可用。
      </template>
    </el-alert>

    <div class="kb-layout">
      <!-- 左：文档列表 -->
      <el-card shadow="never" class="kb-list">
        <template #header>
          <div class="kb-list-head">
            <span>文档</span>
            <el-button
              v-has-perm="['ai:kb:edit']"
              type="primary"
              size="small"
              :icon="Plus"
              @click="openCreate"
            >新建</el-button>
          </div>
        </template>
        <div
          v-for="d in docs"
          :key="d.id"
          class="kb-doc"
          :class="{ active: d.id === currentId }"
          @click="loadDoc(d)"
        >
          <div class="kb-doc-title">{{ d.title }}</div>
          <div class="kb-doc-meta">
            <el-tag size="small" :type="d.status === 'PUBLISHED' ? 'success' : 'info'">
              {{ d.status }}
            </el-tag>
            <span>v{{ d.version }}</span>
          </div>
        </div>
        <el-empty v-if="!docs.length" description="暂无文档" :image-size="60" />
      </el-card>

      <!-- 右：编辑 / 预览 -->
      <el-card shadow="never" class="kb-main">
        <template #header>
          <div class="kb-main-head">
            <el-input v-model="form.title" placeholder="文档标题" class="kb-title-input" />
            <el-radio-group v-model="mode" size="small">
              <el-radio-button value="edit"><el-icon><EditPen /></el-icon> 编辑</el-radio-button>
              <el-radio-button value="preview"><el-icon><View /></el-icon> 预览</el-radio-button>
            </el-radio-group>
            <div class="kb-actions">
              <el-button
                v-has-perm="['ai:kb:edit']"
                :icon="Delete"
                :disabled="!current"
                @click="removeDoc"
              >删除</el-button>
              <el-button
                v-has-perm="['ai:kb:publish']"
                type="warning"
                disabled
                title="后端 KB 接口待接入"
              >发布</el-button>
              <el-button v-has-perm="['ai:kb:edit']" type="primary" @click="save">保存草稿</el-button>
            </div>
          </div>
        </template>

        <el-input v-model="form.summary" placeholder="摘要（切片前置上下文）" class="kb-summary" />

        <MarkdownEditor v-if="mode === 'edit'" v-model="form.contentMd" :doc-id="currentId || undefined" />
        <MarkdownView v-else :content="form.contentMd" class="kb-preview" />

        <el-collapse class="kb-check">
          <el-collapse-item name="check" title="结构检查（切片契约）">
            <div class="kb-check-grid">
              <div>
                <b>规范校验</b>
                <p v-if="!issues.length" class="kb-ok">通过：唯一 H1、标题不跳级</p>
                <p v-for="i in issues" :key="i.line + i.message" class="kb-bad">
                  第 {{ i.line }} 行：{{ i.message }}
                </p>
              </div>
              <div>
                <b>标题锚点（出处）</b>
                <p v-for="h in headings" :key="h.anchor" class="kb-anchor">
                  H{{ h.level }} · {{ h.text }} → #{{ h.anchor }}
                </p>
                <p v-if="!headings.length" class="kb-ok">无标题</p>
              </div>
              <div>
                <b>正文附件引用</b>
                <p v-if="fileRefs.length" class="kb-ok">
                  file: {{ fileRefs.join(', ') }}（保存时由后端建 INLINE 关系）
                </p>
                <p v-else class="kb-ok">无（外链图片会被渲染管线拦截）</p>
              </div>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.knowledge-page {
  padding: 12px;
}
.kb-tip {
  margin-bottom: 12px;
}
.kb-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.kb-list {
  width: 260px;
  flex: none;
}
.kb-list-head,
.kb-main-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.kb-doc {
  padding: 10px 8px;
  border-radius: 4px;
  cursor: pointer;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.kb-doc:hover {
  background: var(--el-fill-color-light);
}
.kb-doc.active {
  background: var(--el-color-primary-light-9);
  border-left: 3px solid var(--el-color-primary);
}
.kb-doc-title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.kb-doc-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.kb-main {
  flex: 1;
  min-width: 0;
}
.kb-title-input {
  max-width: 280px;
}
.kb-actions {
  display: flex;
  gap: 6px;
}
.kb-summary {
  margin-bottom: 12px;
}
.kb-preview {
  min-height: 460px;
  padding: 12px 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}
.kb-check {
  margin-top: 12px;
}
.kb-check-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  font-size: 13px;
}
.kb-check-grid p {
  margin: 4px 0;
}
.kb-ok {
  color: var(--el-color-success);
}
.kb-bad {
  color: var(--el-color-danger);
}
.kb-anchor {
  color: var(--el-text-color-secondary);
}
</style>
