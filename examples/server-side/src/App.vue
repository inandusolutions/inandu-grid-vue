<script setup lang="ts">
import { InanduGrid, useInanduGridServer, type InanduGridColumn } from '@inandu-solutions/grid-vue';

// The Inandu.Grid.Extensions playground: `cd playground/Inandu.Grid.Extensions.Playground && dotnet run`
const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5238/api/products';

const columns: InanduGridColumn[] = [
  { field: 'id', headerText: 'Id', type: 'number', width: 70 },
  { field: 'name', headerText: 'Name', width: 220 },
  { field: 'category', headerText: 'Category', width: 140 },
  { field: 'price', headerText: 'Price', type: 'number', format: '1.2-2', width: 100 },
  { field: 'stock', headerText: 'Stock', type: 'number', width: 90 },
  { field: 'discontinued', headerText: 'Discontinued', type: 'boolean', width: 120 },
];

// The composable turns the grid's sort / search / filter / page state into the request and keeps
// the previous page on screen while the next one loads.
const server = useInanduGridServer({ url: API });
</script>

<template>
  <main style="font-family: system-ui; padding: 16px">
    <h1>grid-vue · serverSide</h1>
    <p>
      {{ server.loading.value ? 'Loading…' : `${server.total.value.toLocaleString()} rows` }}
      <strong v-if="server.error.value" style="color: crimson"> — {{ server.error.value.message }} (is the API running?)</strong>
    </p>
    <InanduGrid
      :rows="server.rows.value"
      :columns="columns"
      :page-size="25"
      :server-side="{ totalItems: server.total.value }"
      @query-change="server.setQuery"
    />
  </main>
</template>
