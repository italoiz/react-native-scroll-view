package io.autodidact.zoomablescrollview;

import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.PointF;
import android.graphics.Rect;
import android.util.Log;
import android.view.MotionEvent;
import android.view.ViewGroup;
import android.widget.ScrollView;

import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.views.scroll.ReactScrollView;

public class RNZoomableScrollView extends ViewGroup {
    public static String TAG = RNZoomableScrollView.class.getSimpleName();
    private GestureEventManager mGestureManager;
    private ThemedReactContext mContext;

    RNZoomableScrollView(ThemedReactContext context){
        super(context);
        mContext = context;
        mGestureManager = new GestureEventManager(this);
    }

    public GestureEventManager getGestureManager() {
        return mGestureManager;
    }

    public ThemedReactContext getReactContext() {
        return mContext;
    }

    @Override
    protected void onDraw(Canvas canvas) {
        mGestureManager.onDraw(canvas);
        super.onDraw(canvas);
    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {
        //super.onLayout(changed, l, t, r, b);
        mGestureManager.getMeasuringHelper().onLayout(changed, l, t, r, b);
        Log.d(TAG, "onLayout: " + mGestureManager.getMeasuringHelper().getLayout());
        Log.d(TAG, "onLayout: " + mGestureManager.getMeasuringHelper().getClipLayout());
    }

    @Override
    public boolean onInterceptTouchEvent(MotionEvent ev) {
        //return super.onInterceptTouchEvent(ev);
        return true;
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {

        //if(super.onTouchEvent(event)) return true;
        boolean disallowInterceptTouchEvent = mGestureManager.requestDisallowInterceptTouchEvent();
        requestDisallowInterceptTouchEvent(disallowInterceptTouchEvent);
        mGestureManager.onTouchEvent(event);
        postInvalidateOnAnimation();

        return true;
        //return super.onTouchEvent(event);
    }
}
