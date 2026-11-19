package com.gabbah.edtnav;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

/**
 * WebView che resta "visibile" per Chrome quando c'e' un giro, la condivisione o la navigazione in corso:
 * cosi' a schermo spento i timer dell'app (posizione al gruppo, avvisi) non vengono rallentati.
 */
public class KeepAliveWebView extends CapacitorWebView {

    public KeepAliveWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(MainActivity.active ? View.VISIBLE : visibility);
    }

    /** Riallinea la visibilita' vera quando l'attivita' in background finisce. */
    public void syncVisibility() {
        super.onWindowVisibilityChanged(MainActivity.active ? View.VISIBLE : getWindowVisibility());
    }
}
