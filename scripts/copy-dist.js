/** 构建后把 dist 复制进 Android 壳 assets/dist */
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'dist')
const dest = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'assets', 'dist')

if (!fs.existsSync(src)) {
  console.error('[copy-dist] 未找到 dist，请先执行 npm run build')
  process.exit(1)
}
fs.rmSync(dest, { recursive: true, force: true })
fs.cpSync(src, dest, { recursive: true })
console.log('[copy-dist] dist -> android/app/src/main/assets/dist 完成')
