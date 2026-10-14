<script setup lang="ts">
import { computed } from 'vue';
import type { InanduGridColumnFilterValue } from '../core';
import type { InanduGridColumn } from '../composables/useInanduGrid';
import type { Translator } from './internal';

/** One filter control per column type, all working off the same `InanduGridColumnFilterValue` shape the core understands. */
const props = defineProps<{
  column: InanduGridColumn;
  value: InanduGridColumnFilterValue | undefined;
  t: Translator;
}>();

const emit = defineEmits<{ change: [patch: Partial<InanduGridColumnFilterValue>] }>();

const type = computed(() => props.column.type ?? 'string');
const label = computed(() => props.t('MsgFilterColumn', { column: props.column.headerText ?? props.column.field }));

function valueOf(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}
</script>

<template>
  <span v-if="type === 'number'" class="inandu-grid-filter-range">
    <input :aria-label="`${label} ${t('MsgFilterMin')}`" type="number" :value="value?.min ?? ''" @input="emit('change', { min: valueOf($event) })" />
    <input :aria-label="`${label} ${t('MsgFilterMax')}`" type="number" :value="value?.max ?? ''" @input="emit('change', { max: valueOf($event) })" />
  </span>
  <span v-else-if="type === 'date'" class="inandu-grid-filter-range">
    <input :aria-label="`${label} ${t('MsgFilterFrom')}`" type="date" :value="value?.from ?? ''" @input="emit('change', { from: valueOf($event) })" />
    <input :aria-label="`${label} ${t('MsgFilterTo')}`" type="date" :value="value?.to ?? ''" @input="emit('change', { to: valueOf($event) })" />
  </span>
  <select v-else-if="type === 'boolean'" :aria-label="label" :value="value?.bool ?? ''" @change="emit('change', { bool: valueOf($event) })">
    <option value="">{{ t('MsgAll') }}</option>
    <option value="true">true</option>
    <option value="false">false</option>
  </select>
  <input v-else :aria-label="label" type="text" :value="value?.text ?? ''" @input="emit('change', { text: valueOf($event) })" />
</template>
