<script setup lang="ts">
import { InanduGrid } from '@inandu-solutions/grid-vue';
import { basicsColumns, buildPeople } from './data';

const rows = buildPeople();
</script>

<template>
  <p class="demo-note" style="margin-bottom: 1rem">
    Click a header to sort (shift-click for a second column) &middot; use the search box &middot; the toolbar exports CSV,
    Excel and PDF.
  </p>
  <InanduGrid :rows="rows" :columns="basicsColumns" :page-size="8" selectable exportable column-toggle lang="en" />
</template>
