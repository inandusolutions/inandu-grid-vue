<script setup lang="ts">
import { InanduGrid } from '@inandu-solutions/grid-vue';
import { buildOrders, orderColumns } from './data';

const rows = buildOrders(10000);
</script>

<template>
  <p class="demo-note" style="margin-bottom: 1rem">
    10,000 rows with <code>virtual-scroll</code> &middot; only the visible ones are in the DOM &middot; sort, search and filter still work.
  </p>
  <InanduGrid :rows="rows" :columns="orderColumns" virtual-scroll :virtual-row-height="40" :height="380" lang="en" />
</template>
