﻿import React, { Component } from 'react';
import PropTypes from 'prop-types';
import {
    View,
    PanResponder,
    Animated,
    StyleSheet,
    Dimensions,
    ViewPropTypes,
    Platform,
    PixelRatio,
    I18nManager,
    findNodeHandle,
} from 'react-native';

const screenScale = Platform.OS === 'ios' ? 1 : PixelRatio.get();
const isRTL = I18nManager.isRTL;

import { PanGestureHandler, PinchGestureHandler, ScrollView, State } from 'react-native-gesture-handler';
import * as _ from 'lodash';
const ScrollEvents = {
    onMomentumScrollBegin: 'onMomentumScrollBegin',
    onMomentumScrollEnd: 'onMomentumScrollEnd',
    onScroll: 'onScroll',
    onScrollBeginDrag: 'onScrollBeginDrag',
    onScrollEndDrag: 'onScrollEndDrag'
};

const Events = {
    onLayout: 'onLayout',
    onContentSizeChange: 'onContentSizeChange',
    ...ScrollEvents
    //onZoom: 'onZoom',
    //onZoomEnd: 'onZoomEnd'
};

const shouldSetResponder = {
    onStartShouldSetResponderCapture: 'onStartShouldSetResponderCapture',
    onMoveShouldSetResponderCapture: 'onMoveShouldSetResponderCapture',
    onStartShouldSetResponder: 'onStartShouldSetResponder',
    onMoveShouldSetResponder: 'onMoveShouldSetResponder'
};

const decelerationRate = {
    normal: 0.998,
    fast: 0.99
};

const directionalLock = {
    horizontal: 'horizontal',
    vertical: 'vertical'
};

const styles = StyleSheet.create({
    container: {
        flex: 1
    },
    indicator: {
        position: 'absolute',
        backgroundColor: 'white',
        borderRadius: 25
    },
    horizontalScrollIndicator: {
        bottom: 0,
        right: 0,
        width: 100,
        height: 10
    },
    verticalScrollIndicator: {
        top: 0,
        width: 10,
        height: 100
    }
});

export default class UpgradedScrollView extends Component {
    static propTypes = {
        //  zoom props
        bounces: PropTypes.bool,
        bouncesZoom: PropTypes.bool,
        zoomScale: PropTypes.number,
        minimumZoomScale: PropTypes.number,
        maximumZoomScale: PropTypes.number,
        pinchGestureEnabled: PropTypes.bool,
        centerContent: PropTypes.bool,
        contentOffset: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
        contentInset: PropTypes.shape({ top: PropTypes.number, bottom: PropTypes.number, left: PropTypes.number, right: PropTypes.number, start: PropTypes.number, end: PropTypes.number }),
        decelerationRate: function (props, propName, componentName) {
            const val = props[propName];
            if ((typeof val !== 'number' && !decelerationRate[val]) || (typeof val === 'number' && (val <= 0 || val >= 1))) {
                return new Error(
                    'Invalid prop `' + propName + '` supplied to' +
                    ' `' + componentName + '`. Validation failed.' +
                    'See documentation: https://facebook.github.io/react-native/docs/scrollview#decelerationrate'
                );
            }
        },
        overScroll: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
        scrollEnabled: PropTypes.bool,
        directionalLockEnabled: PropTypes.bool,
        showsHorizontalScrollIndicator: PropTypes.bool,
        showsVerticalScrollIndicator: PropTypes.bool,

        //  additional ScrollView props
        contentContainerStyle: ViewPropTypes.style,
        style: ViewPropTypes.style,
        indicatorStyle: ViewPropTypes.style,
        refreshControl: PropTypes.element,
        ...ViewPropTypes,

        //  gesture responder 
        onStartShouldSetResponderCapture: PropTypes.func,
        onMoveShouldSetResponderCapture: PropTypes.func,
        onStartShouldSetResponder: PropTypes.func,
        onMoveShouldSetResponder: PropTypes.func,

        //stickyHeaderIndices: vertical only

        //  events
        ...Object.keys(Events)
            .reduce((combined, key) => {
                combined[key] = PropTypes.func;
                return combined;
            }, {}),

        //  ref
        panHandler: PropTypes.any,
        pinchHandler: PropTypes.any
    }

    static defaultProps = {
        bounces: true,
        bouncesZoom: true,
        zoomScale: 1,
        minimumZoomScale: 1,
        maximumZoomScale: 1,
        pinchGestureEnabled: true,
        centerContent: true,
        contentOffset: null,
        contentInset: { top: 0, bottom: 0, left: 0, right: 0, start: 0, end: 0 },
        decelerationRate: decelerationRate.normal,
        overScroll: { x: 0, y: 0 },
        scrollEnabled: true,
        directionalLockEnabled: false,
        showsHorizontalScrollIndicator: true,
        showsVerticalScrollIndicator: true,

        contentContainerStyle: null,
        style: styles.container,
        indicatorStyle: styles.indicator,
        horizontalIndicatorStyle: styles.horizontalScrollIndicator,
        verticalIndicatorStyle: styles.verticalScrollIndicator,
        refreshControl: null,

        onStartShouldSetResponder: () => false,
        onMoveShouldSetResponder: () => false,

        //  events
        ...Object.keys(Events)
            .reduce((combined, key) => {
                combined[key] = () => { };
                return combined;
            }, {}),

        panHandler: React.createRef(),
        pinchHandler: React.createRef()
    }

    static onMoveShouldSetResponderDistance = 100;

    constructor(props) {
        super(props);

        const scale = new Animated.Value(props.zoomScale);
        const clampedScale = Animated.diffClamp(scale, props.minimumZoomScale, props.maximumZoomScale);

        this._scaleValue = props.zoomScale;
        scale.addListener(({ value }) => {
            this._scaleValue = value;
        });

        const translate = new Animated.ValueXY({ x: 0, y: 0 });
        this._translateValue = { x: 0, y: 0 };
        translate.addListener((value) => {
            this._translateValue = value;
            this._eventSender(Events.onScroll);

            if (this._runningAnimations.length > 0) {
                const clampedTranslate = this.getClampedTranslate(this._translateValue);
                if (clampedTranslate.x !== this._translateValue.x || clampedTranslate.y !== this._translateValue.y) {
                    this._runningAnimations.map((anim) => anim.stop());
                    this._runningAnimations = [];
                    this._runningScrollAnimations = [];
                    this.animateScrollIndicatorOpacity(1);
                    Animated.parallel([
                        Animated.spring(this._animatedValues.translate, {
                            toValue: clampedTranslate,
                            useNativeDriver: true
                            //speed: 24,
                        }),
                        Animated.spring(this._animatedValues.scrollIndicator, {
                            toValue: this.getScrollIndicatorOffset(this.getClampedScale(), clampedTranslate),
                            useNativeDriver: true
                            //speed: 24,
                        })
                    ]).start(() => {
                        this._eventSender(Events.onMomentumScrollEnd);
                        this.scrollResponderIsAnimating = false;
                        //this.animateScrollIndicatorOpacity(0);
                    });
                }
            }
        });

        const opacity = new Animated.Value(0);

        const scrollIndicator = new Animated.ValueXY({ x: 0, y: 0 });
        const scrollIndicatorOpacity = new Animated.Value(0);
        /*
        scrollIndicator.addListener((value) => {
            if (this._runningScrollAnimations.length > 0) {
                const scrollIndicatorOffset = this.getScrollIndicatorOffset();
                if (value.x > scrollIndicatorOffset.x || value.x < 0) {
                    //this._runningScrollAnimations.map((anim) => anim && anim.stop());
                    this._runningScrollAnimations = [];
                    this.animateScrollIndicatorOpacity(1);
                    Animated.spring(this._animatedValues.scrollIndicator, {
                        toValue: scrollIndicatorOffset.x,
                        useNativeDriver: true,
                        //speed: 24,
                    }).start();
                }
            }
        });
        */

        this._animatedValues = { scale, clampedScale, translate, opacity, scrollIndicator, scrollIndicatorOpacity };

        this._onLayout = this._onLayout.bind(this);
        this._startShouldSetResponder = this._startShouldSetResponder.bind(this);
        this._handleGrant = this._handleGrant.bind(this);
        this._moveShouldSetResponder = this._moveShouldSetResponder.bind(this);
        this._handleMove = this._handleMove.bind(this);
        this._handleRelease = this._handleRelease.bind(this);
        this._loadPanResponder.call(this);

        this._onStateChange = this._onStateChange.bind(this);
        this._pinch = this._pinch.bind(this);
        this._pan = this._pan.bind(this);


        this.style = StyleSheet.compose({
            opacity: this._animatedValues.opacity,
            transform: [
                { scale: this._animatedValues.clampedScale },
                { translateX: this._animatedValues.translate.x },
                { translateY: this._animatedValues.translate.y },
                { perspective: 1000 }
            ]
        });

        const scrollIndicatorOpacityValue = StyleSheet.flatten([props.horizontalIndicatorStyle, props.verticalIndicatorStyle, props.indicatorStyle]).opacity || 0.3;
        this.indicatorStyles = {
            horizontal: StyleSheet.compose({
                opacity: this._animatedValues.scrollIndicatorOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, scrollIndicatorOpacityValue]
                }),
                transform: [
                    { translateX: this._animatedValues.scrollIndicator.x },
                    { perspective: 1000 }
                ]
            }),
            vertical: StyleSheet.compose({
                opacity: this._animatedValues.scrollIndicatorOpacity.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, scrollIndicatorOpacityValue]
                }),
                transform: [
                    { translateY: this._animatedValues.scrollIndicator.y },
                    { perspective: 1000 }
                ]
            })
        };

        //this.contentInsetStyle = this.getContentInsetStyleAttr();

        this._initialDistance = null;
        this._initialScale = null;
        this._isZooming = false;
        this._directionalLock = null;
        this._didTranslate = { x: false, y: false };
        this._runningAnimations = [];
        this._runningScrollAnimations = [];
        this._scrollToInProgress = false;
        this._indicatorLayout = { width: 0, height: 0 };

        this._overScroll = props.overScroll;

        this.state = {
            width: null,
            height: null
        };
    }

    componentDidUpdate(prevProps, prevState) {
        if (!prevState.width && this.state.width) {
            /*
            const dimensions = Dimensions.get('window');
            const { width, height } = this.state;
            let scale = this.props.zoomScale;
            if (width > dimensions.width) scale = Math.min(dimensions.width / width, scale);
            if (height > dimensions.height) scale = Math.min(dimensions.height / height, scale);
            */
            const contentOffset = this.props.contentOffset || { x: isRTL ? this.state.width : 0, y: 0 };
            this.scrollTo({ ...contentOffset, animated: false });

            Animated.timing(this._animatedValues.opacity, {
                toValue: 1,
                useNativeDriver: true
            }).start(() => this.__isMounted = true);

            this.props.onContentSizeChange(this.state.width, this.state.height);
        }
        else if (prevState.width !== this.state.width) {
            console.log('ScrollView updated');
            this.props.onContentSizeChange(this.state.width, this.state.height);
            //this.scrollTo({ ...this.getScrollOffset(), scale: 1 });
            //this.scrollResponderZoomTo({ ...this.getScrollOffset(), width: Math.max(this.state.width,prevState.width), height: Math.max(this.state.height,prevState.height) });
        }
    }

    _onLayout(evt) {
        const { width, height } = evt.nativeEvent.layout;
        if (width > 0 && height > 0 && width !== this.state.width && height !== this.state.height) {
            this.setState({ width, height });
        }
        this.props.onLayout(evt);
    }

    _onIndicatorLayout(measurement, evt) {
        this._indicatorLayout[measurement] = evt.nativeEvent.layout[measurement];
    }

    getDecelerationRate() {
        return typeof this.props.decelerationRate === 'number' ? this.props.decelerationRate : decelerationRate[this.props.decelerationRate];
    }

    getContentInset(scale = this.getClampedScale(), contentInset = this.props.contentInset) {
        const start = {
            key: isRTL ? 'right' : 'left',
            value: contentInset.start ? contentInset.start : isRTL ? contentInset.right : contentInset.left
        };
        const end = {
            key: isRTL ? 'left' : 'right',
            value: contentInset.end ? contentInset.end : isRTL ? contentInset.left : contentInset.right
        };

        return {
            top: contentInset.top / scale,
            bottom: contentInset.bottom / scale,
            [start.key]: start.value / scale,
            [end.key]: end.value / scale
        };
    }

    getOverScroll(scale = this.getClampedScale()) {
        return { x: this._overScroll.x / scale, y: this._overScroll.y / scale };
    }

    setOverScroll({ x, y }) {
        this._overScroll = { x, y };
    }

    getContentInsetStyleAttr(contentInset = this.getContentInset(1)) {
        const attr = 'padding';

        const _contentInset = {
            [`${attr}Top`]: contentInset.top,
            [`${attr}Bottom`]: contentInset.bottom,
            [`${attr}Left`]: contentInset.left,
            [`${attr}Right`]: contentInset.right
            //[`${attr}Start`]: contentInset.start,
            //[`${attr}End`]: contentInset.end
        };

        return StyleSheet.compose(_contentInset);
    }

    calcDistance(x1, y1, x2, y2) {
        let dx = Math.abs(x1 - x2);
        let dy = Math.abs(y1 - y2);
        return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    }

    getClampedScale(value = this._scaleValue) {
        const { minimumZoomScale, maximumZoomScale } = this.props;
        return Math.min(Math.max(value, minimumZoomScale), maximumZoomScale);
    }

    getClampers(scale = undefined) {
        const dimensions = Dimensions.get('window');
        const clampedScale = this.getClampedScale(scale);
        const scaler = 0.5 * (clampedScale - 1) / clampedScale;

        const clampers = {
            x: scaler * this.state.width,
            y: scaler * this.state.height
        };

        const complementaryClampers = {
            x: clampers.x - this.state.width + dimensions.width / clampedScale,
            y: clampers.y - this.state.height + dimensions.height / clampedScale
        };

        return { clampers, complementaryClampers };
    }

    getClampedTranslate({ x, y } = this._translateValue, scale = undefined) {
        const dimensions = Dimensions.get('window');
        const clampedScale = this.getClampedScale(scale);
        const scaler = 0.5 * (clampedScale - 1) / clampedScale;
        //const complementaryScaler = 0.5 * (clampedScale + 1) / clampedScale;
        const overScroll = this.getOverScroll(clampedScale);
        const contentInset = this.getContentInset(clampedScale);
        const dimensionsAfterInset = {
            width: dimensions.width - contentInset.left - contentInset.right,
            height: dimensions.height - contentInset.top - contentInset.bottom
        };
        const { clampers, complementaryClampers } = this.getClampers(scale);
        /*
         *  moved to getClampers()
        const clampers = {
            x: scaler * this.state.width,
            y: scaler * this.state.height
        }

        const complementaryClampers = {
            x: clampers.x - this.state.width + dimensions.width / clampedScale, 
            y: clampers.y - this.state.height + dimensions.height / clampedScale
        }
        */
        const clampCheck = {
            x: this.state.width * clampedScale - dimensionsAfterInset.width > 0,
            y: this.state.height * clampedScale - dimensionsAfterInset.height > 0
        };

        const sizeCheck = {
            x: this.state.width - dimensionsAfterInset.width > 0,
            y: this.state.height - dimensionsAfterInset.height > 0
        };

        const alignToTop = {
            x: isRTL ? complementaryClampers.x : clampers.x,
            y: clampers.y
        };

        const centeredContent = {
            x: sizeCheck.x ? clampers.x + (dimensions.width - this.state.width * clampedScale) * 0.5 : 0,
            y: sizeCheck.y ? clampers.y + (dimensions.height - this.state.height * clampedScale) * 0.5 : 0
        };

        const centerContent = this.props.centerContent ? {
            x: clampCheck.x ? alignToTop.x : centeredContent.x,
            y: clampCheck.y ? alignToTop.y : centeredContent.y
        } : alignToTop;

        const clampedValues = {
            x: Math.min(clampers.x + contentInset.left, Math.max(complementaryClampers.x - overScroll.x - contentInset.right, x)),
            y: Math.min(clampers.y + contentInset.top, Math.max(complementaryClampers.y - overScroll.y - contentInset.bottom, y))
        };

        return {
            x: clampCheck.x || clampedScale > 1 ? clampedValues.x : centeredContent.x,
            y: clampCheck.y || clampedScale > 1 ? clampedValues.y : centeredContent.y
        };
    }

    getScrollIndicatorOffset(scale = this.getClampedScale(), translations = this.getClampedTranslate()) {
        const dimensions = Dimensions.get('window');
        const scrollOffset = this.getScrollOffset(scale, translations);
        const scrollOffsetMax = this.getScrollOffset(scale, this.getClampers(scale).complementaryClampers);
        const ratio = {
            x: scrollOffsetMax.x > 0 ? scrollOffset.x / scrollOffsetMax.x : 0,
            y: scrollOffsetMax.y > 0 ? scrollOffset.y / scrollOffsetMax.y : 0
        };
        const offset = {
            x: (dimensions.width - this._indicatorLayout.width) * ratio.x,
            y: (dimensions.height - this._indicatorLayout.height) * ratio.y
        };
        return {
            x: Math.min(Math.max(0, offset.x), dimensions.width - this._indicatorLayout.width),
            y: Math.min(Math.max(0, offset.y), dimensions.height - this._indicatorLayout.height)
        };
    }

    animateScrollIndicatorOpacity(toValue) {
        this._activeScrollIndicatorAnimation && this._activeScrollIndicatorAnimation.stop();
        this._activeScrollIndicatorAnimation = Animated.timing(this._animatedValues.scrollIndicatorOpacity, { toValue, useNativeDriver: true });
        this._activeScrollIndicatorAnimation.start(() => this._activeScrollIndicatorAnimation = null);
    }

    _loadPanResponder() {
        this._responder = {
            onStartShouldSetResponder: this._startShouldSetResponder,
            onStartShouldSetResponderCapture: () => false,
            onMoveShouldSetResponder: this._moveShouldSetResponder,
            onMoveShouldSetResponderCapture: () => false,
            onResponderGrant: this._handleGrant,
            //onResponderReject: () => { },
            onResponderMove: this._handleMove,
            onResponderRelease: this._handleRelease,
            onResponderTerminationRequest: () => true,
            onResponderTerminate: this._handleRelease
        };
        this._panResponder = PanResponder.create({
            onStartShouldSetPanResponder: (evt, gestureState) => this.props.scrollEnabled || this.props.pinchGestureEnabled,
            onStartShouldSetPanResponderCapture: (evt, gestureState) => false,
            onMoveShouldSetPanResponder: (evt, gestureState) => (this.props.scrollEnabled || this.props.pinchGestureEnabled) && Math.hypot(gestureState.dx, gestureState.dy) > 10,
            onMoveShouldSetPanResponderCapture: (evt, gestureState) => false,
            onPanResponderGrant: this._handleGrant,
            onPanResponderMove: this._handleMove,
            onPanResponderRelease: this._handleRelease,
            onPanResponderTerminationRequest: (evt, gestureState) => true,
            onPanResponderTerminate: this._handleRelease,
            onShouldBlockNativeResponder: (evt, gestureState) => false
        });
    }

    _startShouldSetResponder(evt) {
        this._grant = evt.nativeEvent;
        return this.props.scrollEnabled || this.props.pinchGestureEnabled || this.props.onStartShouldSetResponder(evt);
    }

    _handleGrant(evt) {
        this.scrollResponderIsAnimating = true;
        this._translateStart = {
            x: this._translateValue.x,
            y: this._translateValue.y
        };
        this._scaleStart = this.getClampedScale();
        this._eventSender(Events.onScrollBeginDrag);

        const { touches, changedTouches, ...nativeEvent } = evt.nativeEvent;
        this._grant = nativeEvent;
        this._lastTouch = nativeEvent;
        this._gestureState = {
            x0: nativeEvent.locationX,
            y0: nativeEvent.locationY,
            dx: 0,
            dy: 0,
            vx: 0,
            vy: 0
        };

        this.animateScrollIndicatorOpacity(1);
    }

    _moveShouldSetResponder(evt) {
        if (!this._grant) return;
        const { pageX, pageY, timestamp } = evt.nativeEvent;
        const dx = pageX - this._grant.pageX;
        const dy = pageY - this._grant.pageY;
        const dt = timestamp - this._lastTouch.timestamp;
        const vx = (pageX - this._lastTouch.pageX) / dt;
        const vy = (pageY - this._lastTouch.pageY) / dt;
        const d = ScrollView.onMoveShouldSetResponderDistance;

        return ((this.props.scrollEnabled || this.props.pinchGestureEnabled) && Math.hypot(dx, dy) > d) || this.props.onMoveShouldSetResponder(evt);
    }

    _handleMove(evt) {
        let touches = evt.nativeEvent.touches;
        if (touches.length === 2 && this.props.pinchGestureEnabled) {
            let touch1 = touches[0];
            let touch2 = touches[1];

            const d = this.calcDistance(touches[0].pageX, touches[0].pageY, touches[1].pageX, touches[1].pageY);
            if (!this._initialDistance) this._initialDistance = d;
            const zoom = d / this._initialDistance;
            if (!this._initialScale) this._initialScale = zoom - this._scaleValue;
            //const scale = this.props.bouncesZoom ? zoom - this._initialScale : this.getClampedScale(zoom - this._initialScale);
            const scale = this.getClampedScale(zoom - this._initialScale);
            const clampedTranslations = this.getClampedTranslate(this._translateStart, scale);
            this._translateStart = clampedTranslations;

            const scrollIndicatorOffset = this.getScrollIndicatorOffset(scale, clampedTranslations);

            this._isZooming = true;

            return Animated.event(
                [
                    null,
                    {
                        scale: this._animatedValues.scale,
                        x: this._animatedValues.translate.x,
                        y: this._animatedValues.translate.y,
                        scrollX: this._animatedValues.scrollIndicator.x,
                        scrollY: this._animatedValues.scrollIndicator.y
                    }
                ])
                (null, {
                    scale,
                    ...clampedTranslations,
                    scrollX: scrollIndicatorOffset.x,
                    scrollY: scrollIndicatorOffset.y
                });
        }
        else if (touches.length === 1 && !this._isZooming && this.props.scrollEnabled) {
            const { pageX, pageY, timestamp } = evt.nativeEvent;
            const dx = pageX - this._grant.pageX;
            const dy = pageY - this._grant.pageY;
            const dt = timestamp - this._lastTouch.timestamp;
            const vx = (pageX - this._lastTouch.pageX) / dt;
            const vy = (pageY - this._lastTouch.pageY) / dt;
            const scale = this.getClampedScale(this._scaleValue);
            const translations = {
                x: dx / scale + this._translateStart.x,
                y: dy / scale + this._translateStart.y
            };
            const m = Math.abs(vy) / Math.abs(vx);
            const clampedTranslations = this.getClampedTranslate(translations);

            if (this.props.directionalLockEnabled) {
                if (!this._directionalLock) {
                    this._directionalLock = {
                        value: m < 0.5 ? directionalLock.horizontal : m > 2 ? directionalLock.vertical : null,
                        ...clampedTranslations
                    };
                }
                switch (this._directionalLock.value) {
                    case directionalLock.horizontal:
                        clampedTranslations.y = this._directionalLock.y;
                        break;
                    case directionalLock.vertical:
                        clampedTranslations.x = this._directionalLock.x;
                        break;
                }
            }

            this._didTranslate = {
                x: translations.x === clampedTranslations.x,
                y: translations.y === clampedTranslations.y
            };

            const { touches, changedTouches, ...nativeEvent } = evt.nativeEvent;
            this._lastTouch = nativeEvent;
            this._gestureState = { dx, dy, vx, vy };

            const scrollIndicatorOffset = this.getScrollIndicatorOffset(scale, clampedTranslations);

            return Animated.event(
                [
                    null, {
                        x: this._animatedValues.translate.x,
                        y: this._animatedValues.translate.y,
                        scrollX: this._animatedValues.scrollIndicator.x,
                        scrollY: this._animatedValues.scrollIndicator.y
                    }
                ])
                (null, {
                    ...clampedTranslations,
                    scrollX: scrollIndicatorOffset.x,
                    scrollY: scrollIndicatorOffset.y
                });
        }
    }

    _handleRelease({ vx, vy } = this._gestureState) {
        const deceleration = this.getDecelerationRate();
        const clampedScale = this.getClampedScale();
        const clampedTranslate = this.getClampedTranslate();
        const didClamptranslate = this._translateValue.x !== clampedTranslate.x || this._translateValue.y !== clampedTranslate.y;
        const didShrink = this.props.bounces || (clampedScale < this._scaleStart && didClamptranslate && this._isZooming);
        
        const v = {
            x: vx / clampedScale,
            y: vy / clampedScale
        };

        this._initialDistance = null;
        this._initialScale = null;
        this._isZooming = false;
        this._directionalLock = null;

        this._eventSender(Events.onScrollEndDrag);

        const animations = [];
        
        if ((this._didTranslate.x || didShrink) && typeof vx === 'number') {
            animations.push(
                Animated.decay(this._animatedValues.translate.x, {
                    velocity: v.x,
                    deceleration,
                    useNativeDriver: true
                })
            );
            if (this._indicatorLayout.width > 0) {
                animations.push(
                    Animated.decay(this._animatedValues.scrollIndicator.x, {
                        velocity: -v.x * this.state.width / this._indicatorLayout.width,
                        deceleration,
                        useNativeDriver: true
                    })
                );
            }
        }
        if ((this._didTranslate.y || didShrink) && typeof vy === 'number') {
            animations.push(
                Animated.decay(this._animatedValues.translate.y, {
                    velocity: v.y,
                    deceleration,
                    useNativeDriver: true
                })
            );
            if (this._indicatorLayout.height > 0) {
                animations.push(
                    Animated.decay(this._animatedValues.scrollIndicator.y, {
                        velocity: -v.y * this.state.height / this._indicatorLayout.height,
                        deceleration,
                        useNativeDriver: true
                    })
                );
            }
        }

        this._runningAnimations = animations;
        //this._runningScrollAnimations = [animations[1], animations[3]];

        /*
        if (this.props.bouncesZoom && this._scaleValue !== clampedScale) {
            animations.push(
                Animated.spring(this._animatedValues.scale, {
                    toValue: clampedScale,
                    useNativeDriver: true
                }));
        }
        */
        const timeStart = new Date();
        const dissolveScrollIndicators = () => {
            const t = setTimeout(() => {
                this.animateScrollIndicatorOpacity(0);
                clearTimeout(t);
            }, Math.max(500 - (new Date() - timeStart), 0));
        };

        if (animations.length > 0) {
            this._eventSender(Events.onMomentumScrollBegin);
            Animated.parallel(animations)
                .start(({ finished }) => {
                    this._didTranslate = { x: false, y: false };
                    dissolveScrollIndicators();
                    if (finished) {
                        this._eventSender(Events.onMomentumScrollEnd);
                        this.scrollResponderIsAnimating = false;
                    }
                });
        }
        else {
            this._didTranslate = { x: false, y: false };
            dissolveScrollIndicators();
        }
    }

    getScrollOffset(scale = this.getClampedScale(), translation = this._translateValue) {
        const scaler = 0.5 * (scale - 1) / scale;
        return {
            x: Math.round(this.state.width * scaler - translation.x),
            y: Math.round(this.state.height * scaler - translation.y)
        };
    }

    scrollTo({ x, y, overScroll = false, scale = null, animated = true, callback = null }) {
        const clampedScale = scale ? this.getClampedScale(scale) : this.getClampedScale();
        const scaler = 0.5 * (clampedScale - 1) / clampedScale;
        const _contentOffset = {
            x: -x + this.state.width * scaler,
            y: -y + this.state.height * scaler
        };

        const translations = overScroll === true ? _contentOffset : this.getClampedTranslate(_contentOffset, clampedScale);
        if (typeof overScroll === 'object') {
            translations.x -= overScroll.x || 0;
            translations.y -= overScroll.y || 0;
        }

        const scrollIndicatorOffset = this.getScrollIndicatorOffset(clampedScale, translations);

        if (animated) {
            this._activeScrollIndicatorAnimation && this._activeScrollIndicatorAnimation.stop();    // may cause problems when running a bunch of animation in another place
            const animations = [
                Animated.timing(this._animatedValues.translate, { toValue: translations, useNativeDriver: true }),
                Animated.timing(this._animatedValues.scrollIndicator, { toValue: scrollIndicatorOffset, useNativeDriver: true })
            ];
            this.scrollResponderIsAnimating = true;
            this._scrollToInProgress = true;
            //  do not add to this._runningAnimations because the translation exceeds the clamp while scaling
            if (scale) animations.unshift(Animated.timing(this._animatedValues.scale, { toValue: this.getClampedScale(scale), useNativeDriver: true }));
            Animated.parallel(animations)
                .start((arg) => {
                    this._scrollToInProgress = false;
                    this.scrollResponderIsAnimating = false;
                    callback && callback(arg);
                });
        }
        else {
            if (scale) this._animatedValues.scale.setValue(this.getClampedScale(scale));
            this._animatedValues.translate.setValue(translations);
            this._animatedValues.scrollIndicator.setValue(scrollIndicatorOffset);
            this.flashScrollIndicators();
            callback && callback();
        }
    }

    scrollToEnd({ animated = true, callback = null }) {
        this.scrollTo({ x: this.state.width, y: this.state.height, animated, callback });
    }

    scrollResponderZoomTo({ x, y, width, height, animated = true, callback = null }) {
        // zoomToRect
        const widthScale = this.state.width / width;
        const heightScale = this.state.height / height;
        const scale = this.getClampedScale(Math.min(widthScale, heightScale));
        this.scrollTo({ x, y, scale, animated, callback });
    }

    scrollResponderScrollNativeHandleToKeyboard(reactNode = null, extraHeight, preventNegativeScrollOffset = true) {
        this._overScroll.y = preventNegativeScrollOffset ? Math.max(extraHeight, 0) : extraHeight;
    }

    getNode() {
        return findNodeHandle(this.ref);
    }

    getScrollResponder() {
        //__DEV__ && console.log('`getScrollResponder` is a dummy method pointing back to the `ScrollView`. Used for compatibility with iOS');
        return this;
    }

    getScrollRef() {
        //__DEV__ && console.log('`getScrollRef` is a dummy method pointing back to the `ScrollView`. Used for compatibility with iOS');
        return this;
    }

    flashScrollIndicators() {
        this._activeScrollIndicatorAnimation && this._activeScrollIndicatorAnimation.stop();
        Animated.sequence([
            Animated.timing(this._animatedValues.scrollIndicatorOpacity, { toValue: 1, useNativeDriver: true }),
            Animated.timing(this._animatedValues.scrollIndicatorOpacity, { toValue: 0, useNativeDriver: true })
        ]).start();
    }

    _eventSender(eventType) {
        const { width, height } = this.state;
        const scale = this.getClampedScale();
        const evt = {};

        const newNativeEvent = {
            target: this.getNode(),
            layoutMeasurement: { width, height },
            contentSize: { width: width * scale, height: height * scale },
            contentOffset: this.getScrollOffset(),
            contentInset: this.getContentInset(1),
            zoomScale: scale
        };
        evt.nativeEvent = newNativeEvent;
        this.props[eventType](evt);
    }

    _onStateChange(e: GestureHandlerStateChangeEvent) {
        if (e.nativeEvent.state === State.ACTIVE) {
            this._onStateActive(e);
        }
        else if (e.nativeEvent.oldState === State.ACTIVE) {
            this._onStateEnd({
                vx: e.nativeEvent.velocityX,
                vy: e.nativeEvent.velocityY
            });
        }
    }

    _onStateActive(e: GestureHandlerStateChangeEvent) {
        this.scrollResponderIsAnimating = true;
        this._translateStart = {
            x: this._translateValue.x,
            y: this._translateValue.y
        };
        this._scaleStart = this.getClampedScale();
        this._eventSender(Events.onScrollBeginDrag);

        this._gestureState = {
            x0: e.nativeEvent.absoluteX,
            y0: e.nativeEvent.absoluteY,
            dx: 0,
            dy: 0,
            vx: 0,
            vy: 0
        };

        this.animateScrollIndicatorOpacity(1);
    }

    _onStateEnd({ vx, vy } = this._gestureState) {
        const deceleration = this.getDecelerationRate();
        const clampedScale = this.getClampedScale();
        const clampedTranslate = this.getClampedTranslate();
        const didClamptranslate = this._translateValue.x !== clampedTranslate.x || this._translateValue.y !== clampedTranslate.y;
        const didShrink = this.props.bounces || (clampedScale < this._scaleStart && didClamptranslate && this._isZooming);

        const v = {
            x: vx / clampedScale,
            y: vy / clampedScale
        };

        this._initialDistance = null;
        this._initialScale = null;
        this._isZooming = false;
        this._directionalLock = null;

        this._eventSender(Events.onScrollEndDrag);

        const animations = [];
        /*
        if ((this._didTranslate.x || didShrink) && typeof vx === 'number') {
            animations.push(
                Animated.decay(this._animatedValues.translate.x, {
                    velocity: v.x,
                    deceleration,
                    useNativeDriver: true
                })
            );
            if (this._indicatorLayout.width > 0) {
                animations.push(
                    Animated.decay(this._animatedValues.scrollIndicator.x, {
                        velocity: -v.x * this.state.width / this._indicatorLayout.width,
                        deceleration,
                        useNativeDriver: true
                    })
                );
            }
        }
        if ((this._didTranslate.y || didShrink) && typeof vy === 'number') {
            animations.push(
                Animated.decay(this._animatedValues.translate.y, {
                    velocity: v.y,
                    deceleration,
                    useNativeDriver: true
                })
            );
            if (this._indicatorLayout.height > 0) {
                animations.push(
                    Animated.decay(this._animatedValues.scrollIndicator.y, {
                        velocity: -v.y * this.state.height / this._indicatorLayout.height,
                        deceleration,
                        useNativeDriver: true
                    })
                );
            }
        }
        */
        this._runningAnimations = animations;
        //this._runningScrollAnimations = [animations[1], animations[3]];

        /*
        if (this.props.bouncesZoom && this._scaleValue !== clampedScale) {
            animations.push(
                Animated.spring(this._animatedValues.scale, {
                    toValue: clampedScale,
                    useNativeDriver: true
                }));
        }
        */
        const timeStart = new Date();
        const dissolveScrollIndicators = () => {
            const t = setTimeout(() => {
                this.animateScrollIndicatorOpacity(0);
                clearTimeout(t);
            }, Math.max(500 - (new Date() - timeStart), 0));
        };

        if (animations.length > 0) {
            this._eventSender(Events.onMomentumScrollBegin);
            Animated.parallel(animations)
                .start(({ finished }) => {
                    this._didTranslate = { x: false, y: false };
                    dissolveScrollIndicators();
                    if (finished) {
                        this._eventSender(Events.onMomentumScrollEnd);
                        this.scrollResponderIsAnimating = false;
                    }
                });
        }
        else {
            this._didTranslate = { x: false, y: false };
            dissolveScrollIndicators();
        }
    }

    _pan(e: PanGestureHandlerGestureEvent) {
        const { velocityX, velocityY, translationX, translationY  } = e.nativeEvent
        const dx = translationX;
        const dy = translationY;
        const vx = velocityX;
        const vy = velocityY;
        const scale = this.getClampedScale(this._scaleValue);
        const translations = {
            x: dx / scale + this._translateStart.x,
            y: dy / scale + this._translateStart.y
        };
        const m = Math.abs(vy) / Math.abs(vx);
        const clampedTranslations = this.getClampedTranslate(translations);
        
        if (this.props.directionalLockEnabled) {
            if (!this._directionalLock) {
                this._directionalLock = {
                    value: m < 0.5 ? directionalLock.horizontal : m > 2 ? directionalLock.vertical : null,
                    ...clampedTranslations
                };
            }
            switch (this._directionalLock.value) {
                case directionalLock.horizontal:
                    clampedTranslations.y = this._directionalLock.y;
                    break;
                case directionalLock.vertical:
                    clampedTranslations.x = this._directionalLock.x;
                    break;
            }
        }

        this._didTranslate = {
            x: translations.x === clampedTranslations.x,
            y: translations.y === clampedTranslations.y
        };

        this._gestureState = { dx, dy, vx, vy };

        const scrollIndicatorOffset = this.getScrollIndicatorOffset(scale, clampedTranslations);

        return Animated.event(
            [{
                x: this._animatedValues.translate.x,
                y: this._animatedValues.translate.y,
                scrollX: this._animatedValues.scrollIndicator.x,
                scrollY: this._animatedValues.scrollIndicator.y
            }])
            ({
                ...clampedTranslations,
                scrollX: scrollIndicatorOffset.x,
                scrollY: scrollIndicatorOffset.y
            });
    }

    _pinch(e: PinchGestureHandlerGestureEvent) {
        const zoom = e.nativeEvent.scale;
        if (!this._initialScale) this._initialScale = zoom - this._scaleValue;
        //const scale = this.props.bouncesZoom ? zoom - this._initialScale : this.getClampedScale(zoom - this._initialScale);
        const scale = this.getClampedScale(zoom - this._initialScale);
        const clampedTranslations = this.getClampedTranslate(this._translateStart, scale);
        this._translateStart = clampedTranslations;

        const scrollIndicatorOffset = this.getScrollIndicatorOffset(scale, clampedTranslations);

        this._isZooming = true;

        return Animated.event(
            [{
                scale: this._animatedValues.scale,
                x: this._animatedValues.translate.x,
                y: this._animatedValues.translate.y,
                scrollX: this._animatedValues.scrollIndicator.x,
                scrollY: this._animatedValues.scrollIndicator.y
            }])
            ({
                scale,
                ...clampedTranslations,
                scrollX: scrollIndicatorOffset.x,
                scrollY: scrollIndicatorOffset.y
            });
    }
    
    render() {
        const {
            showsHorizontalScrollIndicator,
            showsVerticalScrollIndicator,
            horizontalIndicatorStyle,
            verticalIndicatorStyle,
            indicatorStyle,
            style,
            contentContainerStyle,
            scrollEnabled,
            pinchGestureEnabled,
            waitFor,
            simultaneousHandlers,
            children,
            ...props
        } = this.props;

        return (
            <PanGestureHandler
                onGestureEvent={this._pan}
                onHandlerStateChange={this._onStateChange}
                enabled={scrollEnabled}
                maxPointers={1}
                ref={this.props.panHandler}
                waitFor={[...waitFor, this.props.pinchHandler]}
                simultaneousHandlers={simultaneousHandlers}
            >
                <Animated.View
                    style={[style, this.style]}
                    ref={ref => this.ref = ref}
                >
                    <PinchGestureHandler
                        onGestureEvent={this._pinch}
                        onHandlerStateChange={this._onStateChange}
                        enabled={pinchGestureEnabled}
                        ref={this.props.pinchHandler}
                        waitFor={waitFor}
                        simultaneousHandlers={simultaneousHandlers}
                    >
                        <Animated.View
                            {...props}
                            onLayout={this._onLayout}
                            style={contentContainerStyle}
                        >
                            {children}
                        </Animated.View>
                    </PinchGestureHandler>
                    {showsHorizontalScrollIndicator &&
                        <Animated.View
                            onLayout={this._onIndicatorLayout.bind(this, 'width')}
                            pointerEvents='none'
                            style={[styles.indicator, styles.horizontalScrollIndicator, indicatorStyle, horizontalIndicatorStyle, this.indicatorStyles.horizontal]}
                        />
                    }
                    {showsVerticalScrollIndicator &&
                        <Animated.View
                            onLayout={this._onIndicatorLayout.bind(this, 'height')}
                            pointerEvents='none'
                            style={[styles.indicator, styles.verticalScrollIndicator, indicatorStyle, verticalIndicatorStyle, this.indicatorStyles.vertical]}
                        />
                    }
                </Animated.View>
            </PanGestureHandler>
        );
    }
}


class PinchableBox extends React.Component {
    _baseScale = new Animated.Value(1);
    _pinchScale = new Animated.Value(1);
    _scale = Animated.multiply(this._baseScale, this._pinchScale);
    _lastScale = 1;
    state = {
        scale: 1,
        containerLayout: { width: 0, height: 0 },
        layout: { width: 0, height: 0 }
    };

    _baseTranslate = new Animated.ValueXY({ x: 0, y: 0 });
    _panTranslate = new Animated.ValueXY({ x: 0, y: 0 });
    _translateX = Animated.divide(Animated.add(this._baseTranslate.x, this._panTranslate.x), new Animated.Value(1));
    _translateY = Animated.divide(Animated.add(this._baseTranslate.y, this._panTranslate.y), new Animated.Value(1));
    _lastTraslate = { x: 0, y: 0 };

    pinchHandler = React.createRef();
    panHandler = React.createRef();

    constructor(props) {
        super(props);
        this._baseTranslate.addListener((v) => console.log('base', v));
        this._panTranslate.addListener((v) => console.log('pan', v));
        this._baseScale.addListener((v) => console.log('scale', v));
    }

    get diffX() {
        const { containerLayout, layout, scale } = this.state;
        const calcW = layout.width * scale;
        const windowW = containerLayout.width;
        return Math.max((calcW - windowW) * 0.5, 0);
    }

    get diffY() {
        const { containerLayout, layout, scale } = this.state;
        const calcH = layout.height * scale;
        const windowH = containerLayout.height;
        return Math.max((calcH - windowH) * 0.5, 0);
    }

    get clampedTranslateX() {
        const diff = this.diffX;
        return Animated.diffClamp(this._translateX, -diff, diff);
    }

    get clampedTranslateY() {
        const diff = this.diffY;
        return Animated.diffClamp(this._translateY, -diff, diff);
    }


    render() {
        return (

            <Animated.View
                style={[styles.container, {
                    transform: [
                        { translateX: this.clampedTranslateX },
                        { translateY: this.clampedTranslateY },
                        { perspective: 200 }
                    ]
                }]}
                collapsable={false}
                onLayout={(e) => {
                    this.setState({ containerLayout: e.nativeEvent.layout })
                }}
            >
               
                    <Animated.View
                    style={{ display: 'flex', justifycontent: 'center', alignItems: 'center' }}
                    collapsable={false}
                    onLayout={(e) => {
                        this.setState({ layout: e.nativeEvent.layout })
                    }}
                    >
                        <PanGestureHandler
                            ref={this.panHandler}
                            //waitFor={this.pinchHandler}
                            onGestureEvent={Animated.event(
                                [{ nativeEvent: { translationX: this._panTranslate.x, translationY: this._panTranslate.y } }],
                                { useNativeDriver: true }
                            )}
                            onHandlerStateChange={(event) => {
                                if (event.nativeEvent.oldState === State.ACTIVE) {
                                    this._lastTraslate = {
                                        x: this._lastTraslate.x + event.nativeEvent.translationX,
                                        y: this._lastTraslate.y + event.nativeEvent.translationY
                                    };
                                    this._baseTranslate.setValue(this._lastTraslate);
                                    this._panTranslate.setValue({ x: 0, y: 0 });
                                }
                            }}
                            maxPointers={1}

                        >
                            <Animated.View
                                style={{
                                    transform: [
                                        { perspective: 200 },
                                        { scale: Animated.diffClamp(this._scale, 0.5, 3) }
                                    ],
                                }}
                        >
                            <PinchGestureHandler
                                ref={this.pinchHandler}
                                waitFor={this.panHandler}
                                onGestureEvent={Animated.event(
                                    [{ nativeEvent: { scale: this._pinchScale } }],
                                    { useNativeDriver: true,listener:(e)=>console.log(e.nativeEvent) }
                                )}
                                onHandlerStateChange={(event) => {
                                    if (event.nativeEvent.state === State.ACTIVE) {
                                        //this._lastTraslate = { x: 0, y: 0 };
                                        //this._baseTranslate.setValue({ x: 0, y: 0 });
                                    }
                                    else if (event.nativeEvent.oldState === State.ACTIVE) {
                                        const prevScale = this._lastScale;
                                        this._lastScale = _.clamp(prevScale * event.nativeEvent.scale, 0.5, 3);
                                        this._baseScale.setValue(this._lastScale);
                                        this._pinchScale.setValue(1);
                                        
                                        this.setState({ scale: this._lastScale });
                                    }
                                }}
                                shouldCancelWhenOutside={false}

                            >
                                <Animated.Image
                                    source={{
                                        uri: 'https://www.sciencemag.org/sites/default/files/styles/article_main_large/public/cc_iStock-478639870_16x9.jpg?itok=1-jMc4Xv'
                                    }}
                                    style={[
                                        { width: 360, height: 360 },
                                    ]}
                                />
                            </PinchGestureHandler>
                            </Animated.View>
                        </PanGestureHandler>
                    </Animated.View>
                
            </Animated.View>

        );
    }
}

