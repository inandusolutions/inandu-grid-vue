<script setup lang="ts">
import { shallowRef } from 'vue';
import { InanduGrid, type InanduGridColumn, type InanduGridRow } from '@inandu-solutions/grid-vue';

const columns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name' },
  { field: 'team', headerText: 'Team' }, // groupable by default — try the "Group by" dropdown
  { field: 'role', headerText: 'Role' },
  { field: 'salary', headerText: 'Salary', type: 'number', format: '1.0-0', aggregate: 'avg' },
  { field: 'joined', headerText: 'Joined', type: 'date', format: 'DD/MM/YYYY' },
  { field: 'active', headerText: 'Active', type: 'boolean', format: 'Yes|No' },
];

const people = buildPeople();
const selected = shallowRef<InanduGridRow[]>([]);

function buildPeople(): InanduGridRow[] {
  const teams = ['Research', 'Platform', 'Design', 'Sales', 'Support'];
  const roles = ['Engineer', 'Lead', 'Manager', 'Analyst', 'Designer'];
  const first = [
    'Ada', 'Alan', 'Grace', 'Linus', 'Katherine', 'Edsger', 'Barbara', 'Donald', 'Radia', 'Margaret',
    'Ken', 'Hedy', 'Tim', 'Anita', 'Guido', 'Bjarne', 'Vint', 'Frances', 'Dennis', 'Sophie',
  ];
  const last = [
    'Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Johnson', 'Dijkstra', 'Liskov', 'Knuth', 'Perlman', 'Hamilton',
    'Thompson', 'Lamarr', 'Berners-Lee', 'Borg', 'van Rossum', 'Stroustrup', 'Cerf', 'Allen', 'Ritchie', 'Wilson',
  ];

  return first.map((f, i) => ({
    name: `${f} ${last[i]}`,
    team: teams[i % teams.length],
    role: roles[i % roles.length],
    salary: 90000 + ((i * 7919) % 80000),
    joined: new Date(2016 + (i % 9), (i * 5) % 12, 1 + (i % 27)),
    active: i % 4 !== 0,
  }));
}
</script>

<template>
  <div class="page">
    <header class="topbar">
      <strong class="brand"><span>inandu-grid</span>-vue</strong>
      <nav>
        <a href="https://github.com/inandusolutions/inandu-grid-vue">GitHub</a>
        <a href="https://www.npmjs.com/package/@inandu-solutions/grid-vue">npm</a>
      </nav>
    </header>

    <main>
      <h1>@inandu-solutions/grid-vue</h1>
      <p class="intro">
        Edit <code>src/App.vue</code> — the grid updates live. Try the search box, the column-filter row, sorting (shift-click
        a header for multi-sort), the "Columns" toggle, the "Group by" dropdown, or the export toolbar.
      </p>

      <div class="card">
        <InanduGrid
          :rows="people"
          :columns="columns"
          :page-size="8"
          selectable
          exportable
          column-toggle
          lang="en"
          @selection-change="selected = $event"
        />
      </div>

      <p class="count">{{ selected.length }} row(s) selected.</p>
    </main>
  </div>
</template>

<style scoped>
.page {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #1b1f24;
  background: #fbfaf7;
  min-height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1.5rem;
  border-bottom: 1px solid #e4e0d6;
  background: #fff;
}
.brand {
  font-size: 1.05rem;
}
.brand span {
  color: #1a8fae;
}
.topbar nav {
  display: flex;
  gap: 1.25rem;
  font-size: 0.9rem;
}
.topbar a {
  color: #5c6470;
}
main {
  max-width: 1080px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
}
h1 {
  font-size: 1.75rem;
  margin: 0 0 0.5rem;
}
.intro {
  color: #3a4048;
  line-height: 1.5;
  max-width: 720px;
}
.card {
  margin-top: 1.5rem;
  background: #fff;
  border: 1px solid #e4e0d6;
  border-radius: 8px;
  padding: 1rem;
  box-shadow: 0 8px 24px -16px rgba(27, 31, 36, 0.25);
}
.count {
  color: #5c6470;
  font-size: 0.9rem;
}
</style>
