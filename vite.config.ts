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
      // SSE 专用（必须写在 '/api' 之前，否则会先命中通用 /api 规则而丢失关缓冲）：
      // 设计原则调整 —— SSE 也纳入全站 /api 体系。这里把 /api/sse 剥回 /sse 再转发到
      // 后端 2025（与 nginx 生产 location /api/sse/ + proxy_pass .../sse/ 对齐）。
      // 长连接必须显式关缓冲（X-Accel-Buffering: no），否则事件攒批才吐。
      // 漏这条规则的后果很隐蔽：开发期请求会打到前端 dev server 9090，被 SPA fallback
      // 兜成一页 index.html —— fetch 照样 resolve、HTTP 200，只是 content-type 是
      // text/html，客户端走到「拿到 200 但不是 event-stream」那条分支无限重连。
      '/api/sse': {
        target: 'http://localhost:2025',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sse/, '/sse'),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('X-Accel-Buffering', 'no')
          })
        },
      },
      // WebSocket 预留（必须写在 '/api' 之前，与 /api/sse 同列）：
      // 设计原则调整 —— socket 也纳入全站 /api 体系。这里把 /api/socket 剥回 /socket
      // 再转发到后端 2025（与 nginx 生产 location /api/socket/ + proxy_pass .../socket/ 对齐）。
      // ws: true 启用 WebSocket 升级代理；后端尚未实现 handler，仅先把反代补全，避免后期接入遗漏。
      '/api/socket': {
        target: 'http://localhost:2025',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api\/socket/, '/socket'),
      },
      // AI 助手对话流（SSE）已纳入全站 /api/sse 前缀：前端请求 /api/sse/ai/chat/stream，
      // 直接命中上方 '/api/sse' 规则（剥离 /api/sse → /sse，并关缓冲）。
      // 故此处不再为 AI 流单开规则，避免与生产 nginx location /api/sse/ 重复。
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
