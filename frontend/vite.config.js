import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build' && mode === 'production' && !env.VITE_API_URL) {
    throw new Error('VITE_API_URL must be set for production builds (e.g. https://smarthire-api.vercel.app)')
  }
  if (command === 'build' && /localhost|127\.0\.0\.1/.test(env.VITE_API_URL || '') && !env.ALLOW_LOCAL_API) {
    throw new Error(`VITE_API_URL points at ${env.VITE_API_URL}; production builds must use the public backend URL`)
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173 },
  }
})
