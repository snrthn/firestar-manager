import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 前端开发端口 9090（避开后端 firestar-service 的 2025）
// 后端地址通过 .env 的 VITE_API_BASE 配置；开发期用相对路径 /api 经下方 proxy 转发。
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 9090,
    open: true, // 开发服务器启动后自动打开浏览器
    // 开发期代理：前端 9090 同源请求 /api/* 转发到后端 2025，规避浏览器跨域(CORS)
    // 注意：Vite 5 的改写选项是 rewrite（函数），不是旧版 http-proxy 的 pathRewrite（对象），
    // 用错键名会导致 /api 前缀不被剥离，请求原样发成 /api/ping 而 404。
    proxy: {
      '/api': {
        target: 'http://localhost:2025',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // 拆分 vendor：框架与组件库单独成 chunk，哈希稳定、命中缓存，
        // 业务改动不会逼用户重下 vue / element-plus。
        // 注意：必须用函数形式对「已进入 bundle 的模块」分组；
        // 若写包名（{ 'element-plus': ['element-plus'] }），rollup 会把整个包的
        // 入口图强行拉进该 chunk，按需引入的 tree-shaking 直接失效（实测 939KB）。
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('element-plus') || id.includes('@element-plus')) {
            return 'element-plus'
          }
          if (/[\\/]node_modules[\\/](vue|vue-router|pinia)[\\/]/.test(id)) {
            return 'vue'
          }
          return undefined
        },
      },
    },
  },
})
