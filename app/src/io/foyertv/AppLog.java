package io.foyertv;

import android.util.Log;

/** The app's log (adb logcat -s Foyer). Never logs keys. */
final class AppLog {
    private AppLog() {}

    static void w(String message) {
        Log.i("Foyer", message);
    }
}
