import { Routes } from '@angular/router';
import { TaskListComponent } from './task-list/task-list.component';
import { TaskFormComponent } from './task-form/task-form.component';

export const TASKS_ROUTES: Routes = [
  {
    path: '',
    component: TaskListComponent,
  },
  {
    path: 'new',
    component: TaskFormComponent,
  },
  {
    path: 'edit/:id',
    component: TaskFormComponent,
  },
];
