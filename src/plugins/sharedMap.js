// @ts-check
// One Leaflet map shared by the main map and the route, trip and bus pages. It
// moves into whichever page is showing, so its tiles stay loaded and it can fly
// from one page's view to the next while the view transition morphs its box.
import L from './leaflet';

const DEFAULT_CENTER = /** @type {[number, number]} */ ([53.5444, -113.4909]);
const DEFAULT_ZOOM = 12;
// under the stops and buses
const ROUTE_PANE_Z_INDEX = 350;
export const ROUTE_PANE = 'routePane';

/** @type {import('leaflet').Map | null} */
let map = null;
/** @type {HTMLDivElement | null} */
let element = null;
/** @type {{ release: () => void } | null} */
let owner = null;
// set between one page letting go of the map and the next taking it in the same render
let handingOver = false;

/**
 * The main map's view and selected bus as it was left, so coming back to it
 * picks up where the user was
 *
 * @type {{ center: import('leaflet').LatLng, zoom: number, busId: string | number | null } | null}
 */
export let rememberedHomeView = null;

/** @param {typeof rememberedHomeView} view */
export const rememberHomeView = (view) => {
    rememberedHomeView = view;
};

const createMap = () => {
    element = document.createElement('div');
    element.className = 'shared-map';
    map = L.map(element, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    map.createPane(ROUTE_PANE);
    /** @type {HTMLElement} */ (map.getPane(ROUTE_PANE)).style.zIndex = String(ROUTE_PANE_Z_INDEX);
    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}/?{accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        // no tile bounds, so regional routes outside the city keep their tiles
        minZoom: 9,
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: `access_token=${import.meta.env.VITE_APP_MAPBOX_ACCESS_TOKEN}`,
    }).addTo(map);
    // pages resize the map's box (the main map's bus panel), which leaflet doesn't notice
    new ResizeObserver(() => {
        if (owner && element?.clientWidth) {
            map?.invalidateSize();
        }
    }).observe(element);
};

/**
 * Moves the shared map into `container`. `release` is called if another page
 * takes the map before this one detaches, so it can remove its layers.
 *
 * @param {HTMLElement} container
 * @param {() => void} release
 * @returns {{ map: import('leaflet').Map, handedOver: boolean, token: object }}
 *   `handedOver` is true when the map came straight from another page, so the
 *   caller should fly to its view rather than jump
 */
export const attachSharedMap = (container, release) => {
    if (!map) {
        createMap();
    }
    const leaflet = /** @type {import('leaflet').Map} */ (map);
    const handedOver = handingOver || owner !== null;
    leaflet.stop();
    owner?.release();
    const token = { release };
    owner = token;
    container.appendChild(/** @type {HTMLDivElement} */ (element));
    // keeps the centre, so the new box shows the same place as the old one
    leaflet.invalidateSize();
    return { map: leaflet, handedOver, token };
};

/**
 * Takes the shared map out of the page, if `token`'s page still holds it
 *
 * @param {object} token from `attachSharedMap`
 */
export const detachSharedMap = (token) => {
    if (owner !== token) {
        return;
    }
    owner = null;
    map?.stop();
    element?.remove();
    // the next page mounts in the same render, so this only lasts until then
    handingOver = true;
    setTimeout(() => {
        handingOver = false;
    });
};
