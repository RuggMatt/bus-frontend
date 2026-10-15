import { createApp} from 'vue'
import App from './App.vue'
import router from './router'
import { VueQueryPlugin } from "@tanstack/vue-query"
import vuetify from './plugins/vuetify';
import { installMapTransitions } from './utils/viewTransition';

// Vue.config.productionTip = false

const app = createApp(App);
app.use(vuetify)
app.use(router);
installMapTransitions(router);
app.use(VueQueryPlugin);
app.mount('#app')
