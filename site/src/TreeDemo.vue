<script setup lang="ts">
import { InanduGrid } from '@inandu-solutions/grid-vue';
import { buildOrgChart, treeColumns } from './data';

const rows = buildOrgChart();
</script>

<template>
  <p class="demo-note" style="margin-bottom: 1rem">
    Nested rows via <code>tree-children-key</code> &middot; click the arrow to expand/collapse a row.
  </p>
  <InanduGrid :rows="rows" :columns="treeColumns" tree-children-key="reports" tree-default-expanded="all" lang="en" />
</template>
