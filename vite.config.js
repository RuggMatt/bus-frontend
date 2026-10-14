import { defineConfig } from "vite"
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    include: [
      'vuetify/components/VOverlay',
      'vuetify/components/VDialog',
      'vuetify/components/VMenu',
      'vuetify/components/VSelect',
      'vuetify/components/VTooltip',
    ],
  },
  server: {
    proxy: {
        // not /buses, which is the app's bus page
        "^/bus(/|\\.db$)": {
            target: "https://bus.mattschlosser.me/",
            secure: false
        }
    }
  }
})