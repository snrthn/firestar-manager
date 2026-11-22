/**
 * CI 单测报告包装器（零新增依赖）
 *
 * 背景：云效「火星财务-管理端」流水线的 Node.js 单元测试 job 里有一个
 * UnitTestReport 步骤，它固定按 Mocha/mochawesome 的口径读取：
 *   REPORT_PATH = mochawesome-report/mochawesome.html
 *   同目录下必须有 mochawesome.json，且 JSON 里要有 stats.tests / passes /
 *   failures / pending / passPercent 字段（见 flow-step/UnitTestReport 的
 *   MochaParser.count 实现）。
 * 但本项目用的是 vitest（npm test = vitest run），默认只往终端打印结果，
 * 不产出 mochawesome 文件 —— 于是用例 131/131 全过，流水线却因为报告步骤
 * 找不到文件而判 FAIL。
 *
 * 本脚本用 vitest 自带的 json reporter 产出原始结果，再转换成 mochawesome
 * 格式，同时写一份极简 HTML 供报告步骤上传展示。**不引入任何新 npm 包**，
 * vitest 退出码原样透传，真有用例失败时流水线照样会挂。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reportDir = path.join(root, 'mochawesome-report')
const rawPath = path.join(reportDir, 'vitest-raw.json')
const jsonPath = path.join(reportDir, 'mochawesome.json')
const htmlPath = path.join(reportDir, 'mochawesome.html')
const vitestBin = path.join(root, 'node_modules', 'vitest', 'vitest.mjs')

if (!existsSync(vitestBin)) {
  console.error('[ci-report] 找不到 node_modules/vitest/vitest.mjs，请先 npm install')
  process.exit(1)
}

mkdirSync(reportDir, { recursive: true })

// 支持 `npm test -- <vitest args>` 透传，便于本地只跑某个文件。
const extraArgs = process.argv.slice(2)
const run = spawnSync(
  process.execPath,
  [
    vitestBin,
    'run',
    '--reporter=default',
    '--reporter=json',
    `--outputFile=${rawPath}`,
    ...extraArgs,
  ],
  { cwd: root, stdio: 'inherit', env: process.env }
)

const exitCode = run.status === null ? 1 : run.status
let raw
try {
  raw = JSON.parse(readFileSync(rawPath, 'utf8'))
} catch (err) {
  // vitest 连 JSON 都没产出（例如版本升级改了 reporter 行为）时，
  // 造一份"全失败"的报告，让云效用失败数据显式暴露问题，而不是静默 0 用例。
  console.error('[ci-report] 读取 vitest JSON 报告失败：', err.message)
  raw = {
    numTotalTests: 0,
    numPassedTests: 0,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
    numFailedTestSuites: exitCode === 0 ? 0 : 1,
  }
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
// 注意：vitest 的 numFailedTestSuites 会把「失败的文件」和「失败的 suite」
// 各记一次（1 个用例挂掉时它是 2），直接加到 numFailedTests 上会把 1 报成 3。
// 所以失败数以 assertionResults 里的 failed 状态为准；连断言都没收集到时
// （文件语法错 / 导入失败）才退回套件级计数，保证 FAIL_ON_ERROR 有数据可判。
const assertions = (Array.isArray(raw.testResults) ? raw.testResults : []).flatMap(
  (suite) => (Array.isArray(suite.assertionResults) ? suite.assertionResults : [])
)
const total = num(raw.numTotalTests)
const passes = num(raw.numPassedTests)
const failedAssertions = assertions.filter((t) => t.status === 'failed').length
const failures = failedAssertions || (exitCode === 0 ? 0 : num(raw.numFailedTests) || num(raw.numFailedTestSuites) || 1)
const pending = num(raw.numPendingTests) + num(raw.numTodoTests)
const passPercent = total > 0 ? Math.round((passes / total) * 10000) / 100 : 0

const stats = { tests: total, passes, failures, pending, passPercent }
const mochawesome = {
  stats,
  results: (Array.isArray(raw.testResults) ? raw.testResults : []).map((suite) => ({
    suite: { title: suite.name || '' },
    tests: (Array.isArray(suite.assertionResults) ? suite.assertionResults : []).map((t) => ({
      title: t.fullName || t.title || '',
      fullTitle: t.fullName || t.title || '',
      status: t.status === 'passed' ? 'passed' : t.status === 'pending' ? 'pending' : 'failed',
      duration: t.duration || 0,
      err: t.failureMessages && t.failureMessages.length ? { message: t.failureMessages.join('\n') } : {},
    })),
  })),
}

writeFileSync(jsonPath, JSON.stringify(mochawesome, null, 2), 'utf8')
writeFileSync(
  htmlPath,
  `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>Vitest 单元测试报告</title>
<style>body{font-family:system-ui,sans-serif;margin:40px;color:#1f2937}
.cards{display:flex;gap:16px;flex-wrap:wrap}.card{border:1px solid #e5e7eb;border-radius:8px;padding:16px 24px;min-width:110px}
.b{font-size:28px;font-weight:700}.ok{color:#16a34a}.bad{color:#dc2626}.warn{color:#d97706}</style></head>
<body><h1>Vitest 单元测试报告</h1>
<div class="cards">
<div class="card"><div>用例总数</div><div class="b">${total}</div></div>
<div class="card"><div>通过</div><div class="b ok">${passes}</div></div>
<div class="card"><div>失败</div><div class="b ${failures ? 'bad' : ''}">${failures}</div></div>
<div class="card"><div>跳过</div><div class="b warn">${pending}</div></div>
<div class="card"><div>通过率</div><div class="b">${passPercent}%</div></div>
</div><p>原始结果见 <code>vitest-raw.json</code>，结构化数据见 <code>mochawesome.json</code>。</p>
</body></html>`,
  'utf8'
)

console.log(
  `[ci-report] mochawesome 报告已生成：tests=${total} passes=${passes} failures=${failures} pending=${pending} passPercent=${passPercent}`
)
process.exit(exitCode)
