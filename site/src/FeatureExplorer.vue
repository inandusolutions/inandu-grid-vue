<script setup lang="ts">
import { computed, shallowRef } from 'vue';
import { FEATURES, readme, type DemoTab } from './features';
import { highlight } from './highlight';

const emit = defineEmits<{ (e: 'open-demo', tab: DemoTab): void }>();

// Stroke icons, 24x24 viewBox. Paths are deliberately simple.
const ICONS: Record<string, string> = {
  sort: 'M7 4v16M7 4 3.5 7.5M7 4l3.5 3.5M17 20V4M17 20l-3.5-3.5M17 20l3.5-3.5',
  layers: 'M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5M3 17.5l9 5 9-5',
  download: 'M12 4v11M12 15l-4-4M12 15l4-4M4 20h16',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  columns: 'M4 5h16v14H4zM9.5 5v14M14.5 5v14',
  grid: 'M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16',
  zap: 'M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z',
  server: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01',
  puzzle: 'M9 4h3a2 2 0 1 1 4 0h3v4a2 2 0 1 0 0 4v4h-4a2 2 0 1 0-4 0H7v-4a2 2 0 1 1 0-4V4h2Z',
  tree: 'M6 4v8a3 3 0 0 0 3 3h3M6 4a2 2 0 1 0 0 .01M6 9h6M15 15a2 2 0 1 0 4 0 2 2 0 0 0-4 0M13 9a2 2 0 1 0 4 0 2 2 0 0 0-4 0',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.500 5.600 12 3Z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.500 5l-3 14',
};

const activeId = shallowRef(FEATURES[0].id);
const active = computed(() => FEATURES.find(f => f.id === activeId.value) ?? FEATURES[0]);
const html = computed(() => highlight(active.value.code));
const copied = shallowRef(false);

function copyCode() {
  navigator.clipboard?.writeText(active.value.code).then(() => {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  });
}

function onKey(e: KeyboardEvent) {
  const i = FEATURES.findIndex(f => f.id === activeId.value);
  const next = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : null;
  if (next === null) return;
  e.preventDefault();
  activeId.value = FEATURES[(next + FEATURES.length) % FEATURES.length].id;
  (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
}
</script>

<template>
  <div class="explorer">
    <div class="explorer-list" role="tablist" aria-label="Features" aria-orientation="vertical" @keydown="onKey">
      <button
        v-for="f in FEATURES"
        :key="f.id"
        :id="`tab-${f.id}`"
        role="tab"
        type="button"
        :aria-selected="f.id === activeId"
        :aria-controls="`panel-${f.id}`"
        :tabindex="f.id === activeId ? 0 : -1"
        :class="['explorer-item', `tone-${f.tone}`, { active: f.id === activeId }]"
        @click="activeId = f.id"
      >
        <span class="chip" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path :d="ICONS[f.icon]" />
          </svg>
        </span>
        <span class="explorer-item-title">{{ f.title }}</span>
      </button>
    </div>

    <div :id="`panel-${active.id}`" role="tabpanel" :aria-labelledby="`tab-${active.id}`" :class="['explorer-panel', `tone-${active.tone}`]">
      <div class="explorer-head">
        <span class="chip big" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path :d="ICONS[active.icon]" />
          </svg>
        </span>
        <h3>{{ active.title }}</h3>
      </div>
      <p class="explorer-blurb">{{ active.blurb }}</p>

      <div class="codebox">
        <div class="codebox-bar">
          <span class="dots" aria-hidden="true"><i /><i /><i /></span>
          <span class="codebox-name">{{ active.id }}.vue</span>
          <button class="copy-btn" type="button" @click="copyCode">{{ copied ? 'Copied!' : 'Copy' }}</button>
        </div>
        <pre class="code-block" v-html="html" />
      </div>

      <div class="explorer-actions">
        <button v-if="active.demo" class="btn solid" type="button" @click="emit('open-demo', active.demo)">See it running ↑</button>
        <a class="btn" :href="readme(active.doc)">Read the docs →</a>
      </div>
    </div>
  </div>
</template>
