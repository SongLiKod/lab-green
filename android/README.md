# Android 壳工程（WebView）

标准 Gradle 工程，复用同一套前端代码。`com.labgreen.app`。

## 本地构建 APK

```bash
npm run apk:build
```

流程：`sync-android-version.js`（package.json 版本 → gradle versionName/versionCode）
→ `npm run build`（产出 dist）→ `copy-dist.js`（dist → app/src/main/assets/dist）
→ `gradle assembleDebug`。

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

要求：JDK 17、Android SDK 34（platform + build-tools）、Gradle 8.7+（或用 Android Studio 打开自动生成 wrapper）。

## CI 构建

推 `v*` tag 或在 Actions 页手动触发 `build-apps` 工作流，android job 会自动完成
上面全流程并上传 APK 产物（正式版签名需自行在 `app/build.gradle` 配置 signingConfig）。

## 结构

```
android/
├─ settings.gradle / build.gradle / gradle.properties
└─ app/
   ├─ build.gradle              # AGP 8.5.2 / compileSdk 34 / minSdk 24
   └─ src/main/
      ├─ AndroidManifest.xml
      ├─ java/com/labgreen/app/MainActivity.java   # WebView 壳 + 原生下载 + 文件选择 + AndroidBridge
      ├─ res/values/strings.xml
      └─ assets/dist/           # 前端构建产物（copy-dist.js 生成，不入库）
```

前端通过 `window.AndroidBridge` 识别 Android 形态（`src/utils/misc.ts`），≤768px 自动使用 Vant 移动 UI。
