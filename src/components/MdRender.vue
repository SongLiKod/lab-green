<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '../utils/markdown'
const props = defineProps<{ src: string }>()
const html = computed(() => renderMarkdown(props.src))
</script>
<template>
  <div class="lg-md" v-html="html"></div>
</template>
