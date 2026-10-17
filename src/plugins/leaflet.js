import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './mapGestures';
// after leaflet's css, so it can override leaflet's touch-action
import './mapGestures.css';

globalThis.L = L;

export default L;
