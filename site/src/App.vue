<script setup lang="ts">
import { shallowRef } from 'vue';
import BasicsDemo from './BasicsDemo.vue';
import EditingDemo from './EditingDemo.vue';
import TreeDemo from './TreeDemo.vue';
import DemoVirtual from './DemoVirtual.vue';
import DemoSlots from './DemoSlots.vue';
import FeatureExplorer from './FeatureExplorer.vue';
import type { DemoTab } from './features';
import { highlight } from './highlight';

const NPM_INSTALL = 'npm install @inandu-solutions/grid-vue';

// Split so the SFC compiler never sees a literal closing script tag inside this one.
const SCRIPT_CLOSE = '</' + 'script>';
const USE_IT_SNIPPET = `<script setup lang="ts">
import { InanduGrid } from '@inandu-solutions/grid-vue';
import '@inandu-solutions/grid-vue/style.css';

const columns = [
  { field: 'company', headerText: 'Company' },
  { field: 'revenue', headerText: 'Revenue', type: 'number', aggregate: 'sum' },
];
${SCRIPT_CLOSE}

<template>
  <InanduGrid :rows="rows" :columns="columns" selectable exportable :page-size="25" />
</template>`;

const USE_IT_HTML = highlight(USE_IT_SNIPPET);
const tab = shallowRef<DemoTab>('basics');
const copied = shallowRef(false);

function openDemo(t: DemoTab) {
  tab.value = t;
  document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' });
}

function copyInstall() {
  navigator.clipboard?.writeText(NPM_INSTALL).then(() => {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  });
}
</script>

<template>
  <nav class="nav">
    <a class="nav-brand" href="#top"><span style="color: var(--accent)">inandu-grid</span>-vue</a>
    <div class="nav-links">
      <a href="#demo">Demo</a>
      <a href="#features">Features</a>
      <a href="#start">Get started</a>
      <a class="nav-icon" href="https://www.npmjs.com/package/@inandu-solutions/grid-vue" aria-label="npm">npm</a>
      <a class="nav-icon" href="https://github.com/inandusolutions/inandu-grid-vue" aria-label="GitHub">GitHub</a>
    </div>
  </nav>

  <header id="top" class="hero">
    <div class="wrap">
      <span class="badge"><i class="dot" aria-hidden="true"></i>MIT licensed &middot; Vue 3 &middot; no enterprise tier</span>
      <h1>The Vue data grid with <span class="hl">nothing behind a paywall</span>.</h1>
      <p class="lede">
        Sorting, filtering, grouping, virtual scroll, inline editing and CSV / Excel / PDF export — every feature on this page
        is free and open source. A component and a headless composable, both from day one.
      </p>
      <div class="cta-row">
        <a class="btn solid" href="#demo">Try the live demo</a>
        <a class="btn" href="https://stackblitz.com/github/inandusolutions/inandu-grid-vue/tree/main/examples/stackblitz">Open in StackBlitz</a>
      </div>
      <div class="install-snippet">
        <span class="prompt">$</span>
        <code>{{ NPM_INSTALL }}</code>
        <button class="copy-btn" type="button" @click="copyInstall">{{ copied ? 'Copied!' : 'Copy' }}</button>
      </div>
    </div>
  </header>

  <section id="demo">
    <div class="wrap">
      <span class="eyebrow">Live demo</span>
      <h2>See it working</h2>
      <p class="demo-note">Not screenshots — the real component, running here.</p>

      <div class="tabs">
        <button :class="['tab', { active: tab === 'basics' }]" type="button" @click="tab = 'basics'">Grid basics</button>
        <button :class="['tab', { active: tab === 'editing' }]" type="button" @click="tab = 'editing'">Inline editing</button>
        <button :class="['tab', { active: tab === 'tree' }]" type="button" @click="tab = 'tree'">Tree data</button>
        <button :class="['tab', { active: tab === 'virtual' }]" type="button" @click="tab = 'virtual'">10,000 rows</button>
        <button :class="['tab', { active: tab === 'slots' }]" type="button" @click="tab = 'slots'">Slots &amp; detail</button>
      </div>

      <div class="demo-panel">
        <BasicsDemo v-if="tab === 'basics'" />
        <EditingDemo v-else-if="tab === 'editing'" />
        <TreeDemo v-else-if="tab === 'tree'" />
        <DemoVirtual v-else-if="tab === 'virtual'" />
        <DemoSlots v-else />
      </div>
    </div>
  </section>

  <section id="features" class="band">
    <div class="wrap">
      <span class="eyebrow">Features</span>
      <h2>Everything on the list, free</h2>
      <p class="section-lede">Pick a feature to see the code that turns it on. The real prop, event and slot names — copy, paste, done.</p>
      <FeatureExplorer @open-demo="openDemo" />
    </div>
  </section>

  <section id="start">
    <div class="wrap">
      <span class="eyebrow">Get started</span>
      <h2>Two steps and a grid</h2>
      <div class="start-grid">
        <div>
          <h3>1 &middot; Install</h3>
          <pre class="code-block">{{ NPM_INSTALL }}</pre>
        </div>
        <div>
          <h3>2 &middot; Use it</h3>
          <pre class="code-block" v-html="USE_IT_HTML" />
        </div>
      </div>
      <div class="start-buttons">
        <a class="btn solid" href="https://github.com/inandusolutions/inandu-grid-vue">Source on GitHub</a>
        <a class="btn" href="https://stackblitz.com/github/inandusolutions/inandu-grid-vue/tree/main/examples/stackblitz">Open in StackBlitz</a>
        <a class="btn" href="https://github.com/inandusolutions/inandu-grid">Angular version</a>
        <a class="btn" href="https://github.com/inandusolutions/inandu-grid-react">React version</a>
      </div>
    </div>
  </section>

  <footer>
    <div class="wrap footer-row">
      <div><strong>inandu-grid-vue</strong> &mdash; MIT &copy; <a href="https://www.inandu.com/">Inandu SAS</a></div>
      <div class="footer-links">
        <a href="https://github.com/inandusolutions/inandu-grid-vue">GitHub</a>
        <a href="https://www.npmjs.com/package/@inandu-solutions/grid-vue">npm</a>
        <a href="https://github.com/inandusolutions/inandu-grid">Angular version</a>
        <a href="https://github.com/inandusolutions/inandu-grid-react">React version</a>
      </div>
    </div>
  </footer>
</template>
