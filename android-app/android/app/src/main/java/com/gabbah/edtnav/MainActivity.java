package com.gabbah.edtnav;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    static final String ORIGIN = "https://ilgabbah-ux.github.io";
    /** true quando c'e' qualcosa da tenere vivo a schermo spento (giro, condivisione, navigazione). */
    static volatile boolean active = false;

    private PowerManager.WakeLock wakeLock;
    private boolean stopped = false;
    private KeepAliveWebView web;

    @SuppressLint({ "SetJavaScriptEnabled", "JavascriptInterface" })
    @Override
    protected void load() {
        WebView wv = findViewById(com.getcapacitor.android.R.id.webview);
        if (wv instanceof KeepAliveWebView) web = (KeepAliveWebView) wv;
        if (wv != null) {
            wv.addJavascriptInterface(new Shell(), "EDTShell");
            String js = readAsset("edt-shell.js");
            if (js != null && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
                try {
                    WebViewCompat.addDocumentStartJavaScript(wv, js, Collections.singleton(ORIGIN));
                } catch (Exception ignored) {}
            }
        }
        super.load();
    }

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    private void js(String code) {
        if (bridge != null && bridge.getWebView() != null) bridge.getWebView().evaluateJavascript(code, null);
    }

    @Override
    public void onStart() {
        super.onStart();
        stopped = false;
        releaseWake();
        js("window.__edtShell&&__edtShell.bg(false)");
    }

    @Override
    public void onStop() {
        stopped = true;
        if (active) acquireWake();
        js("window.__edtShell&&__edtShell.bg(true)");
        super.onStop();
    }

    @Override
    public void onDestroy() {
        active = false;
        releaseWake();
        super.onDestroy();
    }

    private void acquireWake() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "edtnav:giro");
                wakeLock.setReferenceCounted(false);
            }
            if (!wakeLock.isHeld()) wakeLock.acquire(12 * 60 * 60 * 1000L); // al massimo 12 ore
        } catch (Exception ignored) {}
    }

    private void releaseWake() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
    }

    /** Chiede una volta sola di togliere il risparmio batteria, altrimenti molti telefoni chiudono l'app a schermo spento. */
    private void askBatteryOnce() {
        try {
            SharedPreferences sp = getSharedPreferences("edtshell", MODE_PRIVATE);
            if (sp.getBoolean("askedBattery", false)) return;
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            sp.edit().putBoolean("askedBattery", true).apply();
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignored) {}
    }

    private boolean fromApp() {
        try {
            String u = bridge.getWebView().getUrl();
            return u != null && u.startsWith(ORIGIN + "/");
        } catch (Exception e) {
            return false;
        }
    }

    /** Funzioni native chiamate da edt-shell.js. */
    class Shell {

        @JavascriptInterface
        public void setActive(final boolean on) {
            if (active == on) return;
            active = on;
            runOnUiThread(() -> {
                if (!on) {
                    releaseWake();
                    if (web != null) web.syncVisibility();
                } else {
                    if (stopped) acquireWake();
                    else askBatteryOnce();
                }
            });
        }

        @JavascriptInterface
        public void askNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT < 33) return;
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
                SharedPreferences sp = getSharedPreferences("edtshell", MODE_PRIVATE);
                if (sp.getBoolean("askedNotif", false)) return;
                sp.edit().putBoolean("askedNotif", true).apply();
                ActivityCompat.requestPermissions(MainActivity.this, new String[] { Manifest.permission.POST_NOTIFICATIONS }, 7301);
            });
        }

        @JavascriptInterface
        public void share(final String json) {
            runOnUiThread(() -> {
                try {
                    if (!fromApp()) return;
                    JSONObject o = new JSONObject(json);
                    String title = o.optString("title", ""), text = o.optString("text", ""), url = o.optString("url", "");
                    String body = text.isEmpty() ? url : (url.isEmpty() || text.contains(url) ? text : text + "\n" + url);
                    JSONArray files = o.optJSONArray("files");
                    ArrayList<Uri> uris = new ArrayList<>();
                    String mime = null;
                    if (files != null && files.length() > 0) {
                        File dir = new File(getCacheDir(), "condividi");
                        if (dir.exists()) {
                            File[] old = dir.listFiles();
                            if (old != null) for (File f : old) f.delete();
                        } else dir.mkdirs();
                        for (int k = 0; k < files.length(); k++) {
                            JSONObject f = files.getJSONObject(k);
                            String name = f.optString("name", "file").replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_");
                            if (name.isEmpty() || name.startsWith(".")) name = "file" + k + name;
                            File out = new File(dir, name);
                            try (FileOutputStream fo = new FileOutputStream(out)) {
                                fo.write(Base64.decode(f.optString("b64", ""), Base64.DEFAULT));
                            }
                            uris.add(FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".fileprovider", out));
                            String t = f.optString("type", "*/*");
                            mime = mime == null ? t : (mime.equals(t) ? mime : "*/*");
                        }
                    }
                    Intent i;
                    if (uris.size() > 1) {
                        i = new Intent(Intent.ACTION_SEND_MULTIPLE);
                        i.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
                    } else {
                        i = new Intent(Intent.ACTION_SEND);
                        if (uris.size() == 1) i.putExtra(Intent.EXTRA_STREAM, uris.get(0));
                    }
                    i.setType(uris.isEmpty() ? "text/plain" : (mime == null || mime.isEmpty() ? "*/*" : mime));
                    if (!body.isEmpty()) i.putExtra(Intent.EXTRA_TEXT, body);
                    if (!title.isEmpty()) i.putExtra(Intent.EXTRA_SUBJECT, title);
                    if (!uris.isEmpty()) {
                        ClipData clip = ClipData.newRawUri("", uris.get(0));
                        for (int k = 1; k < uris.size(); k++) clip.addItem(new ClipData.Item(uris.get(k)));
                        i.setClipData(clip);
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    }
                    startActivity(Intent.createChooser(i, title.isEmpty() ? "Condividi" : title));
                } catch (Exception ignored) {}
            });
        }
    }
}
