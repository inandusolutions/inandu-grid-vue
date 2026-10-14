import type { InanduGridColumn, InanduGridRow } from '@inandu-solutions/grid-vue';

const TEAMS = ['Research', 'Platform', 'Design', 'Sales', 'Support'];
const ROLES = ['Engineer', 'Lead', 'Manager', 'Analyst', 'Designer'];
const FIRST = [
  'Ada', 'Alan', 'Grace', 'Linus', 'Katherine', 'Edsger', 'Barbara', 'Donald', 'Radia', 'Margaret',
  'Ken', 'Hedy', 'Tim', 'Anita', 'Guido', 'Bjarne', 'Vint', 'Frances', 'Dennis', 'Sophie',
];
const LAST = [
  'Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Johnson', 'Dijkstra', 'Liskov', 'Knuth', 'Perlman', 'Hamilton',
  'Thompson', 'Lamarr', 'Berners-Lee', 'Borg', 'van Rossum', 'Stroustrup', 'Cerf', 'Allen', 'Ritchie', 'Wilson',
];

export function buildPeople(): InanduGridRow[] {
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

export const basicsColumns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name' },
  { field: 'team', headerText: 'Team' },
  { field: 'role', headerText: 'Role' },
  { field: 'salary', headerText: 'Salary', type: 'number', format: '1.0-0', aggregate: 'avg' },
  { field: 'joined', headerText: 'Joined', type: 'date', format: 'DD/MM/YYYY' },
  { field: 'active', headerText: 'Active', type: 'boolean', format: 'Yes|No' },
];

export const editingColumns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name', editable: true, required: true },
  { field: 'team', headerText: 'Team' },
  { field: 'role', headerText: 'Role', editable: true },
  { field: 'salary', headerText: 'Salary', type: 'number', format: '1.0-0', editable: true, min: 0 },
];

export function buildOrgChart(): InanduGridRow[] {
  const reports = (n: number, prefix: string) =>
    Array.from({ length: n }, (_, i) => ({ name: `${prefix} ${i + 1}`, role: 'Engineer', team: 'Platform' }));
  return [
    { name: 'Grace Hopper', role: 'VP Engineering', team: 'Leadership', reports: [
      { name: 'Ada Lovelace', role: 'Eng Manager', team: 'Research', reports: reports(3, 'Researcher') },
      { name: 'Alan Turing', role: 'Eng Manager', team: 'Platform', reports: reports(2, 'Platform Eng') },
    ] },
    { name: 'Linus Torvalds', role: 'VP Infrastructure', team: 'Leadership', reports: [
      { name: 'Katherine Johnson', role: 'Eng Manager', team: 'Support', reports: reports(2, 'Support Eng') },
    ] },
  ];
}

export const treeColumns: InanduGridColumn[] = [
  { field: 'name', headerText: 'Name' },
  { field: 'role', headerText: 'Role' },
  { field: 'team', headerText: 'Team' },
];
