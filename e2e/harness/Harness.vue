<script setup lang="ts">
import { shallowRef } from 'vue';
import { InanduGrid } from '../../src';
import type { InanduGridColumn, InanduGridRow, InanduGridRowSave } from '../../src';
import '../../src/styles/inandu-grid.css';

// One scenario per hash route (#basics, #editing, ...), so each spec loads exactly the grid it
// drives. Data is deterministic: assertions can name concrete rows.
const key = location.hash.replace(/^#\/?/, '') || 'basics';

const TEAMS = ['Research', 'Platform', 'Design', 'Sales', 'Support'];
const ROLES = ['Engineer', 'Lead', 'Manager', 'Analyst', 'Designer'];
const FIRST = ['Ada', 'Alan', 'Grace', 'Linus', 'Katherine', 'Edsger', 'Barbara', 'Donald', 'Radia', 'Margaret',
  'Ken', 'Hedy', 'Tim', 'Anita', 'Guido', 'Bjarne', 'Vint', 'Frances', 'Dennis', 'Sophie'];
const LAST = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Johnson', 'Dijkstra', 'Liskov', 'Knuth', 'Perlman', 'Hamilton',
  'Thompson', 'Lamarr', 'Berners-Lee', 'Borg', 'van Rossum', 'Stroustrup', 'Cerf', 'Allen', 'Ritchie', 'Wilson'];

function people(): InanduGridRow[] {
  return FIRST.map((f, i) => ({
    id: i + 1,
    name: `${f} ${LAST[i]}`,
    team: TEAMS[i % TEAMS.length],
    role: ROLES[i % ROLES.length],
    salary: 90000 + ((i * 7919) % 80000),
    joined: new Date(2016 + (i % 9), (i * 5) % 12, 1 + (i % 27)),
    active: i % 4 !== 0,
  }));
}

const personColumns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name' },
  { field: 'team', headerText: 'Team' },
  { field: 'role', headerText: 'Role' },
  { field: 'salary', headerText: 'Salary', type: 'number', format: '1.0-0', aggregate: 'avg' },
  { field: 'joined', headerText: 'Joined', type: 'date', format: 'DD/MM/YYYY' },
  { field: 'active', headerText: 'Active', type: 'boolean', format: 'Yes|No' },
];

const editColumns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name', editable: true, required: true },
  { field: 'team', headerText: 'Team' },
  { field: 'role', headerText: 'Role', editable: true },
  { field: 'salary', headerText: 'Salary', type: 'number', format: '1.0-0', editable: true, min: 0 },
];

const basicsRows = people();

const interactionColumns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name', pinned: 'left', width: 200, editable: true },
  { field: 'team', headerText: 'Team', width: 320 },
  { field: 'role', headerText: 'Role', width: 320 },
  { field: 'salary', headerText: 'Salary', type: 'number', format: '1.0-0', width: 320 },
  { field: 'joined', headerText: 'Joined', type: 'date', format: 'DD/MM/YYYY', width: 320 },
];
const interactionRows = shallowRef<InanduGridRow[]>(people().slice(0, 6));
const interactionLog = shallowRef('');
function onRowOrderChange(next: InanduGridRow[]) {
  interactionRows.value = next;
  interactionLog.value = `order:${next.map(r => String(r['id'])).join(',')}`;
}
function onCellsPaste(updates: { row: InanduGridRow; field: string; value: unknown }[]) {
  interactionRows.value = interactionRows.value.map(r => {
    const mine = updates.filter(u => u.row === r);
    return mine.length ? { ...r, ...Object.fromEntries(mine.map(u => [u.field, u.value])) } : r;
  });
  interactionLog.value = `paste:${updates.length}`;
}
const spanishRows = people().slice(0, 8);
const editRows = shallowRef<InanduGridRow[]>(people().slice(0, 8));
const log = shallowRef('');

function onRowSave({ row, values }: InanduGridRowSave) {
  editRows.value = editRows.value.map(r => (r === row ? { ...r, ...values } : r));
  log.value = `saved:${String(values['name'] ?? row['name'])}`;
}
function onRowCreate(values: Record<string, unknown>) {
  editRows.value = [...editRows.value, { id: Math.max(0, ...editRows.value.map(r => Number(r['id']))) + 1, ...values }];
  log.value = `created:${String(values['name'])}`;
}
function onRowDelete(row: InanduGridRow) {
  editRows.value = editRows.value.filter(r => r !== row);
  log.value = `deleted:${String(row['name'])}`;
}

const kids = (n: number, p: string) =>
  Array.from({ length: n }, (_, i) => ({ name: `${p} ${i + 1}`, role: 'Engineer', team: 'Platform' }));
const treeRows: InanduGridRow[] = [
  { name: 'Grace Hopper', role: 'VP Engineering', team: 'Leadership', reports: [
    { name: 'Ada Lovelace', role: 'Eng Manager', team: 'Research', reports: kids(3, 'Researcher') },
    { name: 'Alan Turing', role: 'Eng Manager', team: 'Platform', reports: kids(2, 'Platform Eng') },
  ] },
  { name: 'Linus Torvalds', role: 'VP Infrastructure', team: 'Leadership', reports: [
    { name: 'Katherine Johnson', role: 'Eng Manager', team: 'Support', reports: kids(2, 'Support Eng') },
  ] },
];
const treeColumns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name' }, { field: 'role', headerText: 'Role' }, { field: 'team', headerText: 'Team' },
];

function orders(n: number): InanduGridRow[] {
  const status = ['Paid', 'Pending', 'Shipped', 'Refunded'];
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    customer: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
    status: status[(i * 13) % status.length],
    total: 20 + ((i * 7919) % 48000) / 100,
  }));
}
const orderColumns: InanduGridColumn[] = [
  { field: 'id', headerText: '#', type: 'number', width: 90 },
  { field: 'customer', headerText: 'Customer' },
  { field: 'status', headerText: 'Status' },
  { field: 'total', headerText: 'Total', type: 'number', format: '1.2-2' },
];
const virtualRows = key === 'virtual' ? orders(10000) : [];
const detailRows = orders(40);
</script>

<template>
  <main :data-scenario="key">
    <InanduGrid v-if="key === 'basics'" :rows="basicsRows" :columns="personColumns" :page-size="8" selectable exportable column-toggle lang="en" />

    <template v-else-if="key === 'editing'">
      <InanduGrid :rows="editRows" :columns="editColumns" deletable creatable lang="en" @row-save="onRowSave" @row-create="onRowCreate" @row-delete="onRowDelete" />
      <output data-testid="log">{{ log }}</output>
    </template>

    <template v-else-if="key === 'interactions'">
      <InanduGrid :rows="interactionRows" :columns="interactionColumns" clipboard cell-range-selection row-reorder autosize lang="en" @row-order-change="onRowOrderChange" @cells-paste="onCellsPaste" />
      <output data-testid="log">{{ interactionLog }}</output>
    </template>

    <InanduGrid v-else-if="key === 'es'" :rows="spanishRows" :columns="editColumns" exportable creatable deletable lang="es" />

    <InanduGrid v-else-if="key === 'tree'" :rows="treeRows" :columns="treeColumns" tree-children-key="reports" lang="en" />

    <InanduGrid v-else-if="key === 'virtual'" :rows="virtualRows" :columns="orderColumns" virtual-scroll :virtual-row-height="40" :height="380" lang="en" />

    <InanduGrid v-else-if="key === 'detail'" :rows="detailRows" :columns="orderColumns" :page-size="8" lang="en">
      <template #cell-status="{ value }"><span data-testid="pill">{{ value }}</span></template>
      <template #detail="{ row }"><div data-testid="detail">Order #{{ row.id }} for {{ row.customer }}</div></template>
    </InanduGrid>
  </main>
</template>
