package com.labgreen.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.webkit.DownloadListener;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

/** LabGreen Android WebView 壳：复用 dist 前端，原生接管下载与文件选择 */
public class MainActivity extends Activity {

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private static final int FILE_PICK = 1001;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> cb, FileChooserParams params) {
                filePathCallback = cb;
                Intent i = params.createIntent();
                try {
                    startActivityForResult(i, FILE_PICK);
                } catch (Exception e) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }
        });
        webView.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                try {
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, guessName(url, contentDisposition));
                    DownloadManager dm = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                    dm.enqueue(req);
                    Toast.makeText(MainActivity.this, "开始下载", Toast.LENGTH_SHORT).show();
                } catch (Exception ignored) {
                }
            }
        });
        webView.loadUrl("file:///android_asset/dist/index.html");
        setContentView(webView);
    }

    private String guessName(String url, String contentDisp) {
        if (contentDisp != null && contentDisp.contains("filename=")) {
            String n = contentDisp.split("filename=")[1].replace("\"", "").trim();
            if (!n.isEmpty()) return n;
        }
        String path = Uri.parse(url).getPath();
        return path != null && path.lastIndexOf('/') >= 0 ? path.substring(path.lastIndexOf('/') + 1) : "download";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_PICK && filePathCallback != null) {
            Uri[] uris = null;
            if (resultCode == RESULT_OK && data != null && data.getDataString() != null) {
                uris = new Uri[]{Uri.parse(data.getDataString())};
            }
            filePathCallback.onReceiveValue(uris);
            filePathCallback = null;
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && webView != null && webView.canGoBack()) {
            webView.goBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    /** 前端据此识别 Android 形态（window.AndroidBridge） */
    class AndroidBridge {
        @android.webkit.JavascriptInterface
        public String platform() {
            return "android";
        }
    }
}
