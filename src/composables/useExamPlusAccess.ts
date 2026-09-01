import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

export type ExamPlusAccess = 'free' | 'member'

const sharedAccess = ref<ExamPlusAccess>('free')
let initialized = false

export function useExamPlusAccess() {
  const route = useRoute()
  const router = useRouter()

  if (!initialized) {
    sharedAccess.value = route.query.access === 'member' ? 'member' : 'free'
    initialized = true
  }

  const isExamPlusMember = computed(() => sharedAccess.value === 'member')

  function setExamPlusAccess(access: ExamPlusAccess) {
    sharedAccess.value = access
    void router.replace({
      query: { ...route.query, access },
      hash: route.hash,
    })
  }

  return {
    accessState: sharedAccess,
    isExamPlusMember,
    setExamPlusAccess,
  }
}
