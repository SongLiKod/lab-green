<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ diff: string }>()
const lines = computed(() => (props.diff || '').split('\n'))
function cls(l: string) {
  if (l.startsWith('+++') || l.startsWith('---')) return 'line hunk'
  if (l.startsWith('+')) return 'line add'
  if (l.startsWith('-')) return 'line del'
  if (l.startsWith('@@')) return 'line hunk'
  return 'line'
}
</script>
<template>
  <div class="lg-diff">
    <div v-for="(l, i) in lines" :key="i" :class="cls(l)">{{ l || ' ' }}</div>
  </div>
</template>
