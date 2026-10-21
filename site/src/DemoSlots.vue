<script setup lang="ts">
import { InanduGrid } from '@inandu-solutions/grid-vue';
import { buildOrders, orderColumns } from './data';

const rows = buildOrders(40);
</script>

<template>
  <p class="demo-note" style="margin-bottom: 1rem">
    A <code>#cell-status</code> scoped slot swaps the plain text for a badge &middot; a <code>#detail</code> slot adds an expandable row.
  </p>
  <InanduGrid :rows="rows" :columns="orderColumns" :page-size="8" lang="en">
    <template #cell-status="{ value }">
      <span :class="['pill', `pill-${String(value).toLowerCase()}`]">{{ value }}</span>
    </template>
    <template #detail="{ row }">
      <div class="detail-card">
        <strong>Order #{{ row.id }}</strong> for {{ row.customer }} &mdash; ${{ Number(row.total).toFixed(2) }}, currently
        <em>{{ String(row.status).toLowerCase() }}</em>.
      </div>
    </template>
  </InanduGrid>
</template>
