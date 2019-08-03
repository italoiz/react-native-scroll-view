package io.autodidact.zoomage;

import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Point;
import android.graphics.PointF;
import android.graphics.Rect;
import android.graphics.RectF;
import android.util.Log;
import android.view.GestureDetector;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.view.VelocityTracker;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.Animation;
import android.view.animation.AnimationSet;
import android.view.animation.ScaleAnimation;
import android.view.animation.TranslateAnimation;
import android.widget.FrameLayout;
import android.widget.OverScroller;

import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.views.view.ReactViewGroup;

public class RNZoomView1 extends ViewGroup implements ScaleGestureDetector.OnScaleGestureListener {
    public static String TAG = RNZoomView1.class.getSimpleName();
    private ScaleGestureDetector mScaleDetector;
    private float mScale = 1f;
    private float minScale = 0.75f;
    private float maxScale = 3f;
    private PointF displacement = new PointF(0, 0);
    private PointF lastDisplacement = new PointF();
    private int doubleTapAnimationDuration = 300;
    private RectF mLayoutRect = new RectF();
    private RectF viewPort = new RectF();
    Matrix matrix = new Matrix();
    private PointF pointer = new PointF();
    private PointF prevPointer = new PointF();
    private int prevPointerId = -1;
    VelocityTracker mVelocityTracker;

    GestureDetector gestureDetector;
    GestureListener gestureListener;

    public RNZoomView1(ThemedReactContext context){
        super(context);
        setClipChildren(false);
        //setLayerType(LAYER_TYPE_SOFTWARE, null);

        setLayoutParams(new ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        mScaleDetector = new ScaleGestureDetector(context, this){
            @Override
            public boolean onTouchEvent(MotionEvent event) {
                return event.getPointerCount() > 1 && super.onTouchEvent(event);
            }
        };

        Rect mViewPort = new MeasureUtility(context).getUsableViewPort();
        //viewPort.set(0, 0, mViewPort.width(), mViewPort.height());
        viewPort.set(mViewPort);
        matrix.preTranslate(mViewPort.left, mViewPort.top);

        gestureListener = new GestureListener();
        gestureDetector = new GestureDetector(context, gestureListener);

        addOnLayoutChangeListener(new OnLayoutChangeListener() {
            @Override
            public void onLayoutChange(View v, int left, int top, int right, int bottom, int oldLeft, int oldTop, int oldRight, int oldBottom) {
                setLayoutRect(left, top, right, bottom);
                matrix.preTranslate(-oldLeft, -oldTop);
                matrix.preTranslate(left, top);
            }
        });

    }

    @Override
    protected void onLayout(boolean changed, int l, int t, int r, int b) {

    }

    @Override
    protected void onDraw(Canvas canvas) {
        canvas.setMatrix(matrix);
        Paint p = new Paint();
        p.setColor(Color.BLUE);
        canvas.drawRect(layoutRect(true), p);
        p.setColor(Color.YELLOW);
        canvas.drawRect(targetViewPort(true), p);

        RectF r = new RectF(-5, -5, 5, 5);
        p.setColor(Color.BLACK);
        canvas.drawRect(r, p);
        r.offset(360, 300);
        p.setColor(Color.BLACK);
        canvas.drawRect(r, p);

        super.onDraw(canvas);
    }

    @Override
    public boolean onTouchEvent(MotionEvent ev) {
        requestDisallowInterceptTouchEvent(true);

        int action = ev.getActionMasked();
        int index = ev.getActionIndex();
        int pointerId = ev.getPointerId(index);
        if(prevPointerId == -1) prevPointerId = pointerId;

        /*
        if(action == MotionEvent.ACTION_DOWN) {
            gestureListener.reset();
        }
        gestureDetector.onTouchEvent(ev);
        if(gestureListener.isFling()){
            return false;
        }
        */

        pointer.set(ev.getX(index), ev.getY(index));

        if(mScaleDetector.onTouchEvent(ev) || action == MotionEvent.ACTION_DOWN || action == MotionEvent.ACTION_POINTER_DOWN || action == MotionEvent.ACTION_POINTER_UP || action == MotionEvent.ACTION_CANCEL || prevPointer == null || prevPointerId != pointerId) {
            if(prevPointer == null) prevPointer = new PointF();
            prevPointer.set(pointer);
        }

        if(action == MotionEvent.ACTION_DOWN){ mVelocityTracker = VelocityTracker.obtain(); }
        mVelocityTracker.addMovement(ev);
        mVelocityTracker.computeCurrentVelocity(1);
        if(action == MotionEvent.ACTION_UP) { mVelocityTracker.recycle(); }

        lastDisplacement.set(pointer.x - prevPointer.x, pointer.y - prevPointer.y);
        matrix.postTranslate(lastDisplacement.x, lastDisplacement.y);

        prevPointer.set(pointer);
        if(action == MotionEvent.ACTION_UP || action == MotionEvent.ACTION_POINTER_UP) {
            prevPointer = null;
        }

        postInvalidateOnAnimation();

        Log.d(TAG, "isInBounds: " + isInBounds(lastDisplacement.x, lastDisplacement.y) + "  " + lastDisplacement);


        return true;
    }

    private void setLayoutRect(int left, int top, int right, int bottom){
        mLayoutRect.set(left, top, right, bottom);
        mLayoutRect.offset(viewPort.left, viewPort.top);
    }

    private RectF layoutRect(boolean relative){
        RectF out = new RectF(mLayoutRect);
        if(relative) out.offsetTo(0, 0);
        return out;
    }

    public RectF drawingRect(boolean relative){
        RectF rect = new RectF();
        RectF src = layoutRect(relative);
        matrix.mapRect(rect, src);
        return rect;
    }

    public RectF targetViewPort(boolean relative){
        RectF layoutRect = layoutRect(false);
        RectF out = new RectF(Math.max(viewPort.left, layoutRect.left), Math.max(viewPort.top, layoutRect.top), Math.min(viewPort.right, layoutRect.right), Math.min(viewPort.bottom, layoutRect.bottom));
        if(relative) out.offsetTo(0, 0);
        return out;
    }

    public boolean isInBounds(float dx, float dy){
        RectF actualLayout = drawingRect(true);
        RectF targetViewPort = targetViewPort(true);

        actualLayout.offset(dx, dy);
        return actualLayout.contains(targetViewPort);
    }

    public static float clamp(float min, float value, float max){
        return Math.max(min, Math.min(value, max));
    }

    public void postScale() {
        postScale(mScaleDetector);
    }

    public void postScale(ScaleGestureDetector detector){
        float scaleBy = clampScaleFactor(detector.getScaleFactor());
        mScale *= scaleBy;
        //RectF src = layoutRect(false);
        //matrix.postScale(scaleBy, scaleBy, src.centerX(), src.centerY());
        matrix.postScale(scaleBy, scaleBy, detector.getFocusX(), detector.getFocusY());
    }

    private float clampScaleFactor(float scaleBy){
        return clampScaleFactor(mScale, scaleBy);
    }

    private float clampScaleFactor(float scale, float scaleBy){
        return clamp(minScale / scale, scaleBy, maxScale / scale);
    }

    @Override
    public boolean onScaleBegin(ScaleGestureDetector detector) {
        postScale(detector);
        return true;
    }

    @Override
    public boolean onScale(ScaleGestureDetector detector) {
        postScale(detector);
        return true;
    }

    @Override
    public void onScaleEnd(ScaleGestureDetector detector) {

    }

    private class GestureListener extends GestureDetector.SimpleOnGestureListener {
        private boolean mDidFling = false;

        public boolean isFling(){
            return mDidFling;
        }

        public void reset(){
            mDidFling = false;
        }

        @Override
        public boolean onFling(MotionEvent e1, MotionEvent e2, float velocityX, float velocityY) {
            float viewportPercetageToFling = 0.5f;
            boolean flingX = Math.abs(e2.getX() - e1.getX()) > viewPort.width() * viewportPercetageToFling;
            boolean flingY = Math.abs(e2.getY() - e1.getY()) > viewPort.height() * viewportPercetageToFling;
            mDidFling = mDidFling || flingX || flingY;
            return false;
        }

        @Override
        public boolean onScroll(MotionEvent e1, MotionEvent e2, float distanceX, float distanceY) {
            return false;
        }
    }
}