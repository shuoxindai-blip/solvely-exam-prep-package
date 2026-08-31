import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/base.css'
import './styles/mock-exam.css'
import './styles/package.css'
import './styles/topic-tools.css'

createApp(App).use(router).mount('#app')
