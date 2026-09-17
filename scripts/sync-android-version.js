/** 从 package.json 同步 Android versionName/versionCode（versionCode = 主×10000 + 次×100 + 补丁） */
const fs = require('fs')
const path = require('path')

const pkg = require(path.join(__dirname, '..', 'package.json'))
const [maj, min, patch] = String(pkg.version).split('.').map((n) => parseInt(n, 10) || 0)
const code = maj * 10000 + min * 100 + patch

const gradleFile = path.join(__dirname, '..', 'android', 'app', 'build.gradle')
let txt = fs.readFileSync(gradleFile, 'utf8')
txt = txt.replace(/versionCode\s+\d+/, `versionCode ${code}`)
txt = txt.replace(/versionName\s+"[^"]+"/, `versionName "${pkg.version}"`)
fs.writeFileSync(gradleFile, txt)
console.log(`[sync-android-version] versionName=${pkg.version} versionCode=${code}`)
