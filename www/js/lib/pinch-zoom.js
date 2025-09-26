/* /www/js/lib/pinch-zoom.js */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.PinchZoom = factory());
})(this, (function () { 'use strict';

    /*! *****************************************************************************
    Copyright (c) Microsoft Corporation.

    Permission to use, copy, modify, and/or distribute this software for any
    purpose with or without fee is hereby granted.

    THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
    REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
    AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
    INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
    LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
    OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
    PERFORMANCE OF THIS SOFTWARE.
    ***************************************************************************** */

    var __assign = function() {
        __assign = Object.assign || function __assign(t) {
            for (var s, i = 1, n = arguments.length; i < n; i++) {
                s = arguments[i];
                for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
            }
            return t;
        };
        return __assign.apply(this, arguments);
    };

    var getDistance = function (a, b) {
        if (!b) {
            return 0;
        }
        return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    };
    var getCenter = function (a, b) {
        if (!b) {
            return a;
        }
        return {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
        };
    };
    var isTouch = function (event) { return !!event.touches; };
    var getTouches = function (event) {
        if (isTouch(event)) {
            var touches_1 = [];
            for (var i = 0; i < event.touches.length; i++) {
                var touch = event.touches[i];
                touches_1.push({ x: touch.pageX, y: touch.pageY });
            }
            return touches_1;
        }
        return [{ x: event.pageX, y: event.pageY }];
    };

    var clamp = function (value, min, max) {
        return Math.max(min, Math.min(max, value));
    };

    var defaultOptions = {
        tapZoomFactor: 2,
        zoomOutFactor: 1.3,
        animationDuration: 300,
        maxZoom: 4,
        minZoom: 0.5,
        draggableUnzoomed: true,
        lockDragAxis: false,
        setOffsetsOnce: false,
        use2d: true,
        useMouseWheel: true,
        useDoubleTap: true,
        verticalPan: false,
        horizontalPan: false,
    };
    var PinchZoom = (function () {
        function PinchZoom(el, options) {
            var _this = this;
            if (options === void 0) { options = {}; }
            this.is3d = false;
            this.isAnimating = false;
            this.isDragging = false;
            this.isZooming = false;
            this.isMoving = false;
            this.hasInteraction = false;
            this.lastGesture = null;
            this.lastTouchStart = null;
            this.lastDoubleTap = null;
            this.initialOffsets = null;
            this.events = {};
            this.options = __assign(__assign({}, defaultOptions), options);
            this.el = el;
            this.el.style.transformOrigin = '0 0';
            this.zoomFactor = 1;
            this.lastScale = 1;
            this.offset = { x: 0, y: 0 };
            this.initialOffset = { x: 0, y: 0 };
            this.target = { x: 0, y: 0 };
            this.previous = { x: 0, y: 0 };
            this.initialDistance = 0;
            this.initialZoomFactor = 1;
            this.is3d = this.options.use2d === false;
            var onInteractionStart = this.onInteractionStart.bind(this);
            var onInteractionMove = this.onInteractionMove.bind(this);
            var onInteractionEnd = this.onInteractionEnd.bind(this);
            var onMouseWheel = this.onMouseWheel.bind(this);
            this.events = {
                'touchstart': onInteractionStart,
                'touchmove': onInteractionMove,
                'touchend': onInteractionEnd,
                'mousedown': onInteractionStart,
                'mousemove': onInteractionMove,
                'mouseup': onInteractionEnd,
                'mouseleave': onInteractionEnd,
                'wheel': onMouseWheel,
            };
            this.update();
            Object.keys(this.events).forEach(function (key) {
                _this.el.addEventListener(key, _this.events[key]);
            });
        }
        PinchZoom.prototype.on = function (event, handler) {
            this.el.addEventListener(event, handler);
        };
        PinchZoom.prototype.onInteractionStart = function (event) {
            var _a, _b;
            if (((_b = (_a = this.options).onZoomStart) === null || _b === void 0 ? void 0 : _b.call(_a, this, event)) === false) {
                return;
            }
            this.stopAnimation();
            this.lastTouchStart = null;
            this.hasInteraction = true;
            this.handleInteractionStart(event);
        };
        PinchZoom.prototype.onInteractionMove = function (event) {
            var _a, _b, _c, _d;
            if (this.isZooming) {
                if (((_b = (_a = this.options).onZoomUpdate) === null || _b === void 0 ? void 0 : _b.call(_a, this, event)) === false) {
                    return;
                }
            }
            if (this.isDragging) {
                if (((_d = (_c = this.options).onDragUpdate) === null || _d === void 0 ? void 0 : _d.call(_c, this, event)) === false) {
                    return;
                }
            }
            this.handleInteractionMove(event);
        };
        PinchZoom.prototype.onInteractionEnd = function (event) {
            var _a, _b, _c, _d;
            if (this.isZooming) {
                if (((_b = (_a = this.options).onZoomEnd) === null || _b === void 0 ? void 0 : _b.call(_a, this, event)) === false) {
                    return;
                }
            }
            else if (this.isDragging) {
                if (((_d = (_c = this.options).onDragEnd) === null || _d === void 0 ? void 0 : _d.call(_c, this, event)) === false) {
                    return;
                }
            }
            this.hasInteraction = false;
            this.end();
        };
        PinchZoom.prototype.onMouseWheel = function (event) {
            if (!this.options.useMouseWheel)
                return;
            event.preventDefault();
            this.isZooming = true;
            var newZoomFactor = this.zoomFactor + event.deltaY * -0.01;
            var parentRect = this.el.parentElement.getBoundingClientRect();
            var center = { x: event.pageX - parentRect.left, y: event.pageY - parentRect.top };
            this.setZoomFactor(newZoomFactor, center);
            this.isZooming = false;
        };
        PinchZoom.prototype.handleInteractionStart = function (event) {
            var touches = getTouches(event);
            if (touches.length > 1) {
                this.lastScale = 1;
                this.isZooming = true;
                this.lastGesture = "zoom";
                this.initialOffset = __assign({}, this.offset);
                this.initialDistance = getDistance(touches[0], touches[1]);
                this.initialZoomFactor = this.zoomFactor;
            }
            else {
                this.isDragging = true;
                this.lastGesture = "drag";
            }
            var _a = getTouches(event), touch = _a[0], other = _a[1];
            this.target = this.options.setOffsetsOnce && this.initialOffsets
                ? this.initialOffsets
                : {
                    x: (touch.x * this.zoomFactor) - this.offset.x,
                    y: (touch.y * this.zoomFactor) - this.offset.y,
                };
            this.previous = other
                ? __assign({}, getCenter(touch, other)) : __assign({}, touch);
            this.checkDoubleTap(event);
        };
        PinchZoom.prototype.handleInteractionMove = function (event) {
            var touches = getTouches(event);
            if (this.isZooming) {
                var _a = getTouches(event), touch = _a[0], other = _a[1];
                var currentDistance = getDistance(touch, other);
                var scale = currentDistance / this.initialDistance;
                var newZoomFactor = this.initialZoomFactor * scale;
                var parentRect = this.el.parentElement.getBoundingClientRect();
                var center = getCenter(touch, other);
                center.x -= parentRect.left;
                center.y -= parentRect.top;
                this.setZoomFactor(newZoomFactor, center);
            }
            else if (this.isDragging) {
                var touch = touches[0];
                var x = touch.x - this.previous.x;
                var y = touch.y - this.previous.y;
                var newOffset = {
                    x: this.offset.x + x,
                    y: this.offset.y + y,
                };
                if (!this.options.lockDragAxis) {
                    this.setOffset(newOffset);
                }
                else {
                    if (Math.abs(x) > Math.abs(y)) {
                        this.setOffset({
                            x: newOffset.x,
                            y: this.offset.y,
                        });
                    }
                    else {
                        this.setOffset({
                            x: this.offset.x,
                            y: newOffset.y,
                        });
                    }
                }
                this.previous = __assign({}, touch);
            }
        };
        PinchZoom.prototype.checkDoubleTap = function (event) {
            if (!this.options.useDoubleTap) {
                return;
            }
            var now = Date.now();
            if (this.lastTouchStart && now - this.lastTouchStart < 300) {
                event.preventDefault();
                this.handleDoubleTap(event);
                switch (this.lastGesture) {
                    case 'zoom':
                        if (this.zoomFactor > 1) {
                            this.isZooming = true;
                        }
                        break;
                    case 'drag':
                        this.isDragging = true;
                        break;
                }
            }
            this.lastTouchStart = now;
        };
        PinchZoom.prototype.handleDoubleTap = function (event) {
            var _a, _b;
            var parentRect = this.el.parentElement.getBoundingClientRect();
            var center = getTouches(event)[0];
            center.x -= parentRect.left;
            center.y -= parentRect.top;
            var now = Date.now();
            var lastDoubleTap = this.lastDoubleTap;
            if (lastDoubleTap && now - lastDoubleTap < 500) {
                if (((_b = (_a = this.options).onDoubleTap) === null || _b === void 0 ? void 0 : _b.call(_a, this, event)) === false) {
                    return;
                }
                this.isZooming = true;
                this.lastScale = 1;
                this.lastGesture = 'zoom';
                if (this.zoomFactor > 1) {
                    this.setZoomFactor(1, center);
                }
                else {
                    this.setZoomFactor(this.options.tapZoomFactor, center);
                }
                this.end();
            }
            this.lastDoubleTap = now;
        };
        PinchZoom.prototype.end = function () {
            this.isDragging = false;
            this.isZooming = false;
        };
        PinchZoom.prototype.setZoomFactor = function (zoomFactor, center) {
            var newZoomFactor = clamp(zoomFactor, this.options.minZoom, this.options.maxZoom);
            var newOffset = {
                x: center.x - (center.x - this.offset.x) * newZoomFactor / this.zoomFactor,
                y: center.y - (center.y - this.offset.y) * newZoomFactor / this.zoomFactor,
            };
            this.zoomFactor = newZoomFactor;
            this.setOffset(newOffset);
        };
        PinchZoom.prototype.setOffset = function (offset) {
            this.offset = __assign({}, offset);
            this.update();
        };
        PinchZoom.prototype.update = function () {
            if (this.isAnimating) {
                return;
            }
            var style = '';
            if (this.is3d) {
                style = "\n        translate3d(" + this.offset.x + "px, " + this.offset.y + "px, 0)\n        scale3d(" + this.zoomFactor + ", " + this.zoomFactor + ", 1)\n      ";
            }
            else {
                style = "\n        translate(" + this.offset.x + "px, " + this.offset.y + "px)\n        scale(" + this.zoomFactor + ")\n      ";
            }
            this.el.style.transform = style;
        };
        PinchZoom.prototype.stopAnimation = function () {
            this.isAnimating = false;
        };
        PinchZoom.prototype.destroy = function () {
            var _this = this;
            Object.keys(this.events).forEach(function (key) {
                _this.el.removeEventListener(key, _this.events[key]);
            });
        };
        return PinchZoom;
    }());

    return PinchZoom;

}));