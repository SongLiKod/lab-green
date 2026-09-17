# Android WebView 壳

复用同一套前端代码：`npm run build` 后将 `dist/` 内容复制到本目录 `app/src/main/assets/dist/`，
用 Android Studio 打开本工程编译 APK 即可。

## 关键文件

`app/src/main/java/com/labgreen/app/MainActivity.java`

```java
package com.labgreen.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView wv = new WebView(this);
        WebSettings s = wv.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);   // localStorage 必需
        wv.setWebViewClient(new WebViewClient());
        wv.loadUrl("file:///android_asset/dist/index.html");
        setContentView(wv);
    }
    @Override
    public void onBackPressed() {
        WebView wv = (WebView) findViewById(android.R.id.content);
        if (wv != null && wv.canGoBack()) wv.goBack(); else super.onBackPressed();
    }
}
```

`app/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.labgreen.app">
    <uses-permission android:name="android.permission.INTERNET" />
    <application android:label="LabGreen" android:usesCleartextTraffic="true">
        <activity android:name=".MainActivity" android:exported="true"
                  android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`app/build.gradle`（module）要点：

```gradle
android {
    compileSdk 34
    defaultConfig { applicationId "com.labgreen.app"; minSdk 24; targetSdk 34; versionCode 10000; versionName "1.0.0" }
    buildTypes { release { minifyEnabled false } }
}
dependencies { }
```

说明：
- 前端通过 `window.AndroidBridge` 是否存在识别 Android 形态（见 `src/utils/misc.ts` 的 `isMobile`）；
  若需要原生下载等能力，可在壳内 `addJavascriptInterface` 注入 `AndroidBridge` 对象。
- 屏幕宽度 ≤768px 时前端自动切换移动 UI（Vant）。
