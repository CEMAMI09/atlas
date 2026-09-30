import { createPinia } from 'pinia'
import { createApp } from 'vue'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/geist-mono/wght.css'
import App from './App.vue'
import router from './router'
import './styles/app.css'

createApp(App).use(createPinia()).use(router).mount('#app')
