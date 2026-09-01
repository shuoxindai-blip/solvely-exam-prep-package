import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export type ProAccess = 'free' | 'member'

const sharedAccess = ref<ProAccess>('free')
let initialized = false

export function useProAccess() {
  const route = useRoute()
  const router = useRouter()

  if (!initialized) {
    sharedAccess.value = route.query.access === 'member' ? 'member' : 'free'
    initialized = true
  }

  const isProMember = computed(() => sharedAccess.value === 'member')

  function setProAccess(access: ProAccess) {
    sharedAccess.value = access
    void router.replace({
      query: { ...route.query, access },
      hash: route.hash,
    })
  }

  return {
    accessState: sharedAccess,
    isProMember,
    setProAccess,
  }
}
