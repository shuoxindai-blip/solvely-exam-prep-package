import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/base.css'
import './styles/package.css'
import './styles/mock-exam.css'
import './styles/topic-tools.css'
import './styles/commercial.css'

createApp(App).use(router).mount('#app')
