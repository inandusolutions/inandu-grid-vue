<script setup lang="ts">
import { shallowRef } from 'vue';
import { InanduGrid, type InanduGridRow, type InanduGridRowSave } from '@inandu-solutions/grid-vue';
import { buildPeople, editingColumns } from './data';

const rows = shallowRef<InanduGridRow[]>(buildPeople().slice(0, 8));

function onRowSave({ row, values }: InanduGridRowSave) {
  rows.value = rows.value.map(r => (r === row ? { ...r, ...values } : r));
}

function onRowCreate(values: Record<string, unknown>) {
  rows.value = [...rows.value, { id: Math.max(0, ...rows.value.map(r => Number(r.id))) + 1, ...values }];
}

function onRowDelete(row: InanduGridRow) {
  rows.value = rows.value.filter(r => r !== row);
}
</script>

<template>
  <p class="demo-note" style="margin-bottom: 1rem">Click "Edit" on a row &middot; required / min / max are validated at save time.</p>
  <InanduGrid
    :rows="rows"
    :columns="editingColumns"
    deletable
    creatable
    lang="en"
    @row-save="onRowSave"
    @row-create="onRowCreate"
    @row-delete="onRowDelete"
  />
</template>
