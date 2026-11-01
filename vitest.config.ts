import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 组件/业务流程测试需要 DOM，切 jsdom（happy-dom 提供），并挂 setup 文件补齐 jsdom 缺失 API
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // 覆盖率（2026-10-27）：此前无任何覆盖率工具，业务代码覆盖度无法度量。
    // provider 用 v8（@vitest/coverage-v8@2.1.9，与 vitest 2.1.8 同主版本，勿升 5.x）。
    // 报告产物：coverage/index.html + coverage/coverage-summary.json（npm run coverage 生成）。
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      // 业务代码口径：types 是纯类型声明、main/api 多为胶水层，先不计入分母（避免虚高）
      include: ['src/**/*.{ts,vue}'],
      exclude: [
        'src/**/*.d.ts',
        'src/main.ts',
        'src/types/**',
        'src/**/*.test.ts',
      ],
    },
  },
})
