<script setup lang="ts">
import { computed } from 'vue';
import type { InanduGridColumn } from '../composables/useInanduGrid';
import type { Translator } from './internal';

/** One editable cell's control, bound to the shared row draft in the same *raw control* shape `parseDraftValue()` expects (a string for text/number/date, a boolean for the checkbox) — plus its inline validation message, if any. */
const props = defineProps<{
  column: InanduGridColumn;
  value: unknown;
  error: string | undefined;
  t: Translator;
}>();

const emit = defineEmits<{ change: [value: unknown] }>();

const type = computed(() => props.column.type ?? 'string');
const label = computed(() => props.t('MsgEditCell', { column: props.column.headerText ?? props.column.field }));
const textValue = computed(() => (typeof props.value === 'string' ? props.value : ''));
</script>

<template>
  <span class="inandu-grid-edit-cell">
    <input
      v-if="type === 'boolean'"
      :aria-label="label"
      type="checkbox"
      :checked="!!value"
      @change="emit('change', ($event.target as HTMLInputElement).checked)"
    />
    <input
      v-else
      :aria-label="label"
      :type="type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'"
      :value="textValue"
      @input="emit('change', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="inandu-grid-field-error">{{ error }}</span>
  </span>
</template>
