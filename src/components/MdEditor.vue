<script setup lang="ts">
import { ref, computed } from 'vue'
import { renderMarkdown } from '../utils/markdown'
import MdRender from './MdRender.vue'

const props = defineProps<{ modelValue: string; placeholder?: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: string): void; (e: 'submit'): void }>()

const mode = ref<'edit' | 'preview'>('edit')
const ta = ref<HTMLTextAreaElement>()

function set(v: string) { emit('update:modelValue', v) }
function wrap(before: string, after = before) {
  const el = ta.value
  if (!el) return
  const { selectionStart: s, selectionEnd: e } = el
  const v = props.modelValue || ''
  set(v.slice(0, s) + before + v.slice(s, e) + after + v.slice(e))
  requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, e + before.length) })
}
function linePrefix(prefix: string) {
  const el = ta.value
  if (!el) return
  const v = props.modelValue || ''
  const s = el.selectionStart
  const lineStart = v.lastIndexOf('\n', s - 1) + 1
  set(v.slice(0, lineStart) + prefix + v.slice(lineStart))
  requestAnimationFrame(() => el.focus())
}
function keydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { emit('submit'); return }
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = ta.value!
    const s = el.selectionStart
    set((props.modelValue || '').slice(0, s) + '  ' + (props.modelValue || '').slice(el.selectionEnd))
    requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2))
  }
}
const html = computed(() => renderMarkdown(props.modelValue))
</script>

<template>
  <div class="mde">
    <div class="mde-bar">
      <button title="加粗" @click="wrap('**')">B</button>
      <button title="斜体" @click="wrap('*')"><i>I</i></button>
      <button title="代码" @click="wrap('`')">{'{ }'}</button>
      <button title="代码块" @click="wrap('\n```\n', '\n```\n')">▤</button>
      <button title="链接" @click="wrap('[', '](url)')">🔗</button>
      <button title="列表" @click="linePrefix('- ')">•</button>
      <button title="标题" @click="linePrefix('## ')">H</button>
      <button title="引用" @click="linePrefix('> ')">❝</button>
      <span class="grow"></span>
      <button :class="{ on: mode === 'edit' }" @click="mode = 'edit'">编辑</button>
      <button :class="{ on: mode === 'preview' }" @click="mode = 'preview'">预览</button>
      <span class="lg-sub">Ctrl+Enter 提交</span>
    </div>
    <textarea v-if="mode === 'edit'" ref="ta" class="mde-ta" :placeholder="placeholder" :value="modelValue" @input="set(($event.target as any).value)" @keydown="keydown"></textarea>
    <div v-else class="mde-preview"><MdRender :src="modelValue || '*（无内容）*'" /></div>
  </div>
</template>

<style scoped>
.mde { border: 1px solid var(--lg-border); border-radius: 8px; overflow: hidden; }
.mde-bar { display: flex; gap: 4px; align-items: center; padding: 6px 8px; background: var(--lg-page-bg); border-bottom: 1px solid var(--lg-border); flex-wrap: wrap; }
.mde-bar button { border: 1px solid transparent; background: transparent; border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 13px; color: var(--lg-text); }
.mde-bar button:hover { border-color: var(--lg-border); background: var(--lg-card-bg); }
.mde-bar button.on { background: var(--lg-primary); color: #fff; }
.mde-bar .grow { flex: 1; }
.mde-ta { width: 100%; min-height: 180px; border: none; outline: none; resize: vertical; padding: 10px; font-family: Consolas, Monaco, monospace; font-size: 13px; background: var(--lg-card-bg); color: var(--lg-text); }
.mde-preview { padding: 10px; min-height: 180px; max-height: 44vh; overflow: auto; background: var(--lg-card-bg); }
</style>
