// @ts-check
// Touch gestures leaflet doesn't have:
// - oneFingerZoom (on by default): double tap and hold, then drag down to zoom in
//   or up to zoom out, as in Google Maps. A double tap without dragging still zooms in.
// - twoFingerPan (off by default): one finger scrolls the page and two fingers move
//   the map, for maps inside a scrolling page. A hint shows when one finger tries.
import L from 'leaflet';

// how quickly and how close together the two taps must be
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 40;
// a touch that moves more than this is a drag, not a tap
const TAP_SLOP_PX = 10;
// dragging this far changes the zoom by one level
const PX_PER_ZOOM = 100;
const HINT_MS = 1500;

/** @param {Event} event */
const isTouch = (event) => /** @type {PointerEvent} */ (event).pointerType === 'touch';

/**
 * @typedef {Object} OneFingerZoomGesture
 * @property {number} pointerId
 * @property {number} startY
 * @property {import('leaflet').Point} point where the second tap landed, which stays put while zooming
 * @property {import('leaflet').LatLng} latLng
 * @property {number} startZoom
 * @property {number} zoom
 * @property {boolean} moved
 */

const OneFingerZoom = L.Handler.extend({
    addHooks() {
        const container = this._map.getContainer();
        /** @type {Set<number>} */
        this._pointers = new Set();
        /** @type {{ time: number, x: number, y: number } | null} */
        this._down = null;
        /** @type {{ time: number, x: number, y: number } | null} */
        this._lastTap = null;
        /** @type {OneFingerZoomGesture | null} */
        this._gesture = null;
        /** @type {[string, (event: any) => void][]} */
        this._listeners = [
            ['pointerdown', this._onPointerDown.bind(this)],
            ['pointermove', this._onPointerMove.bind(this)],
            ['pointerup', this._onPointerUp.bind(this)],
            ['pointercancel', this._onPointerUp.bind(this)],
            ['touchstart', this._blockTouch.bind(this)],
            ['touchmove', this._blockTouch.bind(this)],
            ['touchend', this._blockTouch.bind(this)],
        ];
        // capture, so these run before leaflet's own drag and tap handlers inside the map
        for (const [type, listener] of this._listeners) {
            container.addEventListener(type, listener, { capture: true, passive: false });
        }
    },

    removeHooks() {
        const container = this._map.getContainer();
        for (const [type, listener] of this._listeners) {
            container.removeEventListener(type, listener, { capture: true });
        }
        this._gesture = null;
    },

    /** Whether a double tap is being held, so other handlers leave the touch alone */
    zooming() {
        return this._gesture !== null;
    },

    /** @param {PointerEvent} event */
    _onPointerDown(event) {
        // the zoom buttons and popups take their own taps
        if (!isTouch(event) || /** @type {Element} */ (event.target).closest?.('.leaflet-control, .leaflet-popup')) {
            return;
        }
        this._pointers.add(event.pointerId);
        if (this._pointers.size > 1) {
            // a pinch, which leaflet handles
            this._down = null;
            this._lastTap = null;
            this._end();
            return;
        }
        const now = Date.now();
        const tap = this._lastTap;
        this._lastTap = null;
        this._down = { time: now, x: event.clientX, y: event.clientY };
        if (!tap || now - tap.time > DOUBLE_TAP_MS
            || Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > DOUBLE_TAP_PX) {
            return;
        }
        const map = this._map;
        const point = map.mouseEventToContainerPoint(event);
        map._stop();
        this._gesture = {
            pointerId: event.pointerId,
            startY: event.clientY,
            point,
            latLng: map.containerPointToLatLng(point),
            startZoom: map.getZoom(),
            zoom: map.getZoom(),
            moved: false,
        };
        // keeps the moves coming to the map if the tile under the finger is removed while zooming
        map.getContainer().setPointerCapture?.(event.pointerId);
    },

    /** @param {PointerEvent} event */
    _onPointerMove(event) {
        const gesture = this._gesture;
        if (!gesture || event.pointerId !== gesture.pointerId) {
            return;
        }
        const dy = event.clientY - gesture.startY;
        if (!gesture.moved && Math.abs(dy) < TAP_SLOP_PX) {
            return;
        }
        const map = this._map;
        if (!gesture.moved) {
            gesture.moved = true;
            map._moveStart(true, false);
        }
        gesture.zoom = Math.min(map.getMaxZoom(), Math.max(map.getMinZoom(), gesture.startZoom + dy / PX_PER_ZOOM));
        L.Util.cancelAnimFrame(this._animRequest);
        const center = this._centerFor(gesture, gesture.zoom);
        this._animRequest = L.Util.requestAnimFrame(() => {
            map._move(center, gesture.zoom, { pinch: true, round: false });
        });
    },

    /** @param {PointerEvent} event */
    _onPointerUp(event) {
        if (!isTouch(event)) {
            return;
        }
        this._pointers.delete(event.pointerId);
        const down = this._down;
        this._down = null;
        if (this._gesture?.pointerId === event.pointerId) {
            this._end(event.type === 'pointerup');
            return;
        }
        if (down && event.type === 'pointerup' && this._pointers.size === 0
            && Date.now() - down.time < DOUBLE_TAP_MS
            && Math.hypot(event.clientX - down.x, event.clientY - down.y) < TAP_SLOP_PX) {
            this._lastTap = { time: Date.now(), x: event.clientX, y: event.clientY };
        }
    },

    /**
     * Snaps to a whole zoom level, or zooms in a level for a plain double tap
     * @param {boolean} [tapped] the finger was lifted rather than the touch cancelled
     */
    _end(tapped = false) {
        const gesture = this._gesture;
        this._gesture = null;
        if (!gesture) {
            return;
        }
        const map = this._map;
        L.Util.cancelAnimFrame(this._animRequest);
        if (!gesture.moved) {
            // the browser's dblclick was cancelled along with the touch, so this stands in for it
            if (tapped && map.doubleClickZoom?.enabled()) {
                map.setZoomAround(gesture.point, map.getZoom() + map.options.zoomDelta);
            }
            return;
        }
        const zoom = map._limitZoom(Math.round(gesture.zoom));
        const center = this._centerFor(gesture, zoom);
        if (map.options.zoomAnimation) {
            map._animateZoom(center, zoom, true, map.options.zoomSnap);
        } else {
            map._resetView(center, zoom);
        }
    },

    /**
     * The centre that keeps the tapped place under the finger at `zoom`
     * @param {OneFingerZoomGesture} gesture
     * @param {number} zoom
     */
    _centerFor(gesture, zoom) {
        const map = this._map;
        const offset = gesture.point.subtract(map.getSize().divideBy(2));
        return map.unproject(map.project(gesture.latLng, zoom).subtract(offset), zoom);
    },

    /**
     * While zooming, leaflet's drag and tap handlers mustn't see the touch, and the
     * browser mustn't scroll the page or turn it into clicks
     *
     * @param {TouchEvent} event
     */
    _blockTouch(event) {
        if (!this._gesture) {
            return;
        }
        if (event.cancelable) {
            event.preventDefault();
        }
        event.stopPropagation();
    },
});

const TwoFingerPan = L.Handler.extend({
    addHooks() {
        const container = this._map.getContainer();
        L.DomUtil.addClass(container, 'leaflet-two-finger-pan');
        this._onTouchStart = this._onTouchStart.bind(this);
        this._onTouchMove = this._onTouchMove.bind(this);
        container.addEventListener('touchstart', this._onTouchStart, { capture: true, passive: false });
        container.addEventListener('touchmove', this._onTouchMove, { capture: true, passive: false });
        /** @type {{ x: number, y: number } | null} */
        this._start = null;
    },

    removeHooks() {
        const container = this._map.getContainer();
        L.DomUtil.removeClass(container, 'leaflet-two-finger-pan');
        container.removeEventListener('touchstart', this._onTouchStart, { capture: true });
        container.removeEventListener('touchmove', this._onTouchMove, { capture: true });
        this._hideHint();
    },

    /** @param {TouchEvent} event */
    _onTouchStart(event) {
        if (this._map.oneFingerZoom?.zooming()) {
            return;
        }
        const touch = event.touches[0];
        if (touch && event.touches.length === 1) {
            // leaflet would start dragging, and the page should scroll instead
            this._start = { x: touch.clientX, y: touch.clientY };
            event.stopPropagation();
            return;
        }
        // two fingers, which leaflet pans and zooms with
        this._start = null;
        this._hideHint();
        if (event.cancelable) {
            event.preventDefault();
        }
    },

    /** @param {TouchEvent} event */
    _onTouchMove(event) {
        if (this._map.oneFingerZoom?.zooming()) {
            return;
        }
        if (event.touches.length > 1) {
            // otherwise the browser can still pan the page with two fingers
            if (event.cancelable) {
                event.preventDefault();
            }
            return;
        }
        event.stopPropagation();
        const start = this._start;
        const touch = event.touches[0];
        if (start && touch && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP_PX) {
            this._start = null;
            this._showHint();
        }
    },

    _showHint() {
        if (!this._hint) {
            this._hint = L.DomUtil.create('div', 'leaflet-gesture-hint', this._map.getContainer());
            this._hint.textContent = 'Use two fingers to move the map';
            this._hint.setAttribute('aria-hidden', 'true');
        }
        // reflow, so a hint added just now still fades in
        void this._hint.offsetWidth;
        L.DomUtil.addClass(this._hint, 'leaflet-gesture-hint--visible');
        clearTimeout(this._hintTimeout);
        this._hintTimeout = setTimeout(() => this._hideHint(), HINT_MS);
    },

    _hideHint() {
        clearTimeout(this._hintTimeout);
        if (this._hint) {
            L.DomUtil.removeClass(this._hint, 'leaflet-gesture-hint--visible');
        }
    },
});

L.Map.mergeOptions({ oneFingerZoom: true, twoFingerPan: false });
L.Map.addInitHook('addHandler', 'oneFingerZoom', OneFingerZoom);
L.Map.addInitHook('addHandler', 'twoFingerPan', TwoFingerPan);
