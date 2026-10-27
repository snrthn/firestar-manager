import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 纯函数/工具类单测无需 DOM，用 node 环境即可；后续如需组件测试再切 jsdom 并加 @vue/test-utils
    environment: 'node',
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
