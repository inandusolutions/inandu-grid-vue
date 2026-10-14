<script setup lang="ts">
import { computed } from 'vue';
import type { InanduGridRow } from '../core';
import EditCell from './EditCell.vue';
import { RenderNodes, type RowContext } from './internal';

/** One data row — its own read-only cells, or (while it's the row being edited) `editableColumns` as controls bound to the shared draft, plus a trailing Edit/Save/Cancel/Delete actions cell when `hasRowActions`. */
const props = withDefaults(
  defineProps<{
    ctx: RowContext;
    row: InanduGridRow;
    rowIndex: number;
    /** Adds a leading drag-handle `<td>` and wires the whole row for drag-and-drop reordering — only in the flat, non-grouped render path, same restriction grid-angular's `rowReorder` has. */
    hasRowDragHandle?: boolean;
    isDragOverRow?: boolean;
    /** Adds a leading expand/collapse toggle `<td>` and (while expanded) a full-width detail row right below — only in the flat, non-grouped render path, same restriction grid-angular's `hasMasterDetail` has. */
    hasMasterDetail?: boolean;
    isRowExpanded?: boolean;
  }>(),
  { hasRowDragHandle: false, isDragOverRow: false, hasMasterDetail: false, isRowExpanded: false },
);

const emit = defineEmits<{
  rowDragStart: [];
  rowDragOver: [];
  rowDragLeave: [];
  rowDrop: [];
  toggleExpanded: [];
}>();

const editing = computed(() => props.ctx.isEditingRow(props.row));
const detailToggleLabel = computed(() => (props.isRowExpanded ? props.ctx.t('MsgCollapseDetail') : props.ctx.t('MsgExpandDetail')));

function onDragOver(event: DragEvent) {
  if (!props.hasRowDragHandle) return;
  event.preventDefault(); // required so the browser allows a subsequent 'drop' to fire here
  emit('rowDragOver');
}

function onDrop(event: DragEvent) {
  if (!props.hasRowDragHandle) return;
  event.preventDefault();
  emit('rowDrop');
}

function onHandleDragStart(event: DragEvent) {
  emit('rowDragStart');
  event.dataTransfer?.setData('text/plain', 'row');
}

function onCellMouseDown(event: MouseEvent, colIndex: number) {
  if (props.ctx.cellRangeSelection) props.ctx.onCellRangeMouseDown(event, props.rowIndex, colIndex);
}

function onCellMouseEnter(colIndex: number) {
  if (props.ctx.cellRangeSelection) props.ctx.onCellRangeMouseEnter(props.rowIndex, colIndex);
}
</script>

<template>
  <tr
    :data-row-index="rowIndex"
    :class="isDragOverRow ? 'inandu-drag-over' : undefined"
    @dragover="onDragOver"
    @dragleave="hasRowDragHandle && emit('rowDragLeave')"
    @drop="onDrop"
  >
    <td v-if="hasMasterDetail">
      <button
        type="button"
        class="inandu-grid-detail-toggle"
        :aria-label="detailToggleLabel"
        :title="detailToggleLabel"
        @click="emit('toggleExpanded')"
      >
        {{ isRowExpanded ? '▾' : '▸' }}
      </button>
    </td>
    <td v-if="hasRowDragHandle">
      <span class="inandu-grid-row-drag-handle" :aria-label="ctx.t('MsgDragRow')" draggable="true" @dragstart="onHandleDragStart">⋮⋮</span>
    </td>
    <td v-if="ctx.selectable" :style="ctx.selectColumnStyle">
      <input
        :aria-label="ctx.t('MsgSelectRow', { index: rowIndex + 1 })"
        type="checkbox"
        :checked="ctx.isRowSelected(row)"
        @change="ctx.toggleRowSelection(row)"
      />
    </td>
    <td
      v-for="(column, colIndex) in ctx.columns"
      :key="column.field"
      :style="ctx.columnStyle(column)"
      :data-field="column.field"
      :tabindex="ctx.clipboard ? 0 : undefined"
      :class="ctx.cellRangeSelection && ctx.isCellInRange(rowIndex, colIndex) ? 'inandu-cell-range-selected' : undefined"
      @mousedown="onCellMouseDown($event, colIndex)"
      @mouseenter="onCellMouseEnter(colIndex)"
    >
      <template v-if="editing && column.editable">
        <RenderNodes v-if="ctx.editorContent(column, row) !== undefined" :nodes="ctx.editorContent(column, row)" />
        <EditCell
          v-else
          :column="column"
          :value="ctx.rowDraft[column.field]"
          :error="ctx.fieldErrors[column.field]"
          :t="ctx.t"
          @change="value => ctx.setRowDraftValue(column.field, value)"
        />
      </template>
      <RenderNodes v-else :nodes="ctx.cellContent(column, row)" />
    </td>
    <td v-if="ctx.hasRowActions" class="inandu-grid-row-actions">
      <template v-if="editing">
        <button type="button" :disabled="ctx.isValidating" @click="ctx.saveRow(row)">{{ ctx.t('MsgSaveRow') }}</button>
        <button type="button" :disabled="ctx.isValidating" @click="ctx.cancelRowEdit()">{{ ctx.t('MsgCancelRowEdit') }}</button>
      </template>
      <template v-else>
        <button v-if="ctx.editableColumnCount > 0" type="button" :disabled="ctx.isAnotherRowEditing(row)" @click="ctx.startEditingRow(row)">
          {{ ctx.t('MsgEditRow') }}
        </button>
        <button v-if="ctx.deletable" type="button" :disabled="ctx.isAnotherRowEditing(row)" @click="ctx.deleteRow(row)">
          {{ ctx.t('MsgDeleteRow') }}
        </button>
      </template>
    </td>
  </tr>
  <tr v-if="hasMasterDetail && isRowExpanded" class="inandu-grid-detail-row">
    <td :colspan="ctx.columns.length + ctx.extraColumnCount">
      <RenderNodes :nodes="ctx.detailContent(row)" />
    </td>
  </tr>
</template>
