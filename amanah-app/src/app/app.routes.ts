import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { roleGuard } from './guards/role.guard';
import { UserRole } from './models/user.model';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'login',
    loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'register',
    loadComponent: () => import('./auth/register/register.component').then(m => m.RegisterComponent)
  },
  {
    path: 'verify-email',
    loadComponent: () => import('./auth/verify-email/verify-email.component').then(m => m.VerifyEmailComponent)
  },
  {
    path: 'accept-invitation',
    loadComponent: () => import('./auth/accept-invitation/accept-invitation.component').then(m => m.AcceptInvitationComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'caregivers',
    loadComponent: () => import('./caregivers/caregivers.component').then(m => m.CaregiversComponent),
    canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.ADMIN])]
  },
  {
    path: 'dependent-selector',
    loadComponent: () => import('./dependents/dependent-selector/dependent-selector.component').then(m => m.DependentSelectorComponent),
    canActivate: [authGuard]
  },
  {
    path: 'create-dependent',
    loadComponent: () => import('./dependents/create-dependent/create-dependent.component').then(m => m.CreateDependentComponent),
    canActivate: [authGuard]
  },
  {
    path: 'edit-dependent/:id',
    loadComponent: () => import('./dependents/edit-dependent/edit-dependent.component').then(m => m.EditDependentComponent),
    canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
  },
  {
    path: 'dependent-detail/:id',
    loadComponent: () => import('./dependents/dependent-detail/dependent-detail.component').then(m => m.DependentDetailComponent),
    canActivate: [authGuard]
  },
  {
    path: 'dependent/:id/caregivers',
    loadComponent: () => import('./dependents/caregiver-list/caregiver-list.component').then(m => m.CaregiverListComponent),
    canActivate: [authGuard]
  },
  {
    path: 'dependent/:id/invite',
    loadComponent: () => import('./dependents/invite-caregiver/invite-caregiver.component').then(m => m.InviteCaregiverComponent),
    canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.ADMIN])]
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent)
  },
  {
    path: 'calendar',
    children: [
      {
        path: '',
        loadComponent: () => import('./calendar/calendar.component').then(m => m.CalendarComponent),
        canActivate: [authGuard]
      },
      {
        path: 'create',
        loadComponent: () => import('./calendar/calendar-event-form/calendar-event-form.component').then(m => m.CalendarEventFormComponent),
        canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
      },
      {
        path: 'edit/:id',
        loadComponent: () => import('./calendar/calendar-event-form/calendar-event-form.component').then(m => m.CalendarEventFormComponent),
        canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
      }
    ]
  },
  {
    path: 'tasks',
    children: [
      {
        path: '',
        loadComponent: () => import('./tasks/task-list/task-list.component').then(m => m.TaskListComponent),
        canActivate: [authGuard]
      },
      {
        path: 'new',
        loadComponent: () => import('./tasks/task-form/task-form.component').then(m => m.TaskFormComponent),
        canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
      },
      {
        path: 'edit/:id',
        loadComponent: () => import('./tasks/task-form/task-form.component').then(m => m.TaskFormComponent),
        canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
      },
      {
        path: 'my-tasks',
        loadComponent: () => import('./tasks/caregiver-tasks/caregiver-tasks.component').then(m => m.CaregiverTasksComponent),
        canActivate: [authGuard]
      }
    ]
  },
  {
    path: 'medications',
    children: [
      {
        path: '',
        loadComponent: () => import('./medications/medication-list/medication-list.component').then(m => m.MedicationListComponent),
        canActivate: [authGuard]
      },
      {
        path: 'new',
        loadComponent: () => import('./medications/medication-form/medication-form.component').then(m => m.MedicationFormComponent),
        canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
      },
      {
        path: 'edit/:id',
        loadComponent: () => import('./medications/medication-form/medication-form.component').then(m => m.MedicationFormComponent),
        canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
      }
    ]
  },
  {
    path: 'appointments',
    children: [
      {
        path: '',
        loadComponent: () => import('./appointments/appointments.component').then(m => m.AppointmentsComponent),
        canActivate: [authGuard]
      },
      {
        path: 'new',
        loadComponent: () => import('./appointments/appointment-form/appointment-form.component').then(m => m.AppointmentFormComponent),
        canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
      },
      {
        path: 'form',
        loadComponent: () => import('./appointments/appointment-form/appointment-form.component').then(m => m.AppointmentFormComponent),
        canActivate: [authGuard, roleGuard([UserRole.PRIMARY_CAREGIVER, UserRole.COLLABORATIVE_CAREGIVER, UserRole.ADMIN])]
      }
    ]
  },
  {
    path: 'chat',
    loadComponent: () => import('./chat/chat.component').then(m => m.ChatComponent),
    canActivate: [authGuard]
  },
  {
    path: 'documents',
    loadComponent: () => import('./documents/document-management/document-management.component').then(m => m.DocumentManagementComponent),
    canActivate: [authGuard]
  },
  {
    path: 'profile',
    loadComponent: () => import('./caregiver/caregiver-profile/caregiver-profile.component').then(m => m.CaregiverProfileComponent),
    canActivate: [authGuard]
  },
  {
    path: 'profile/:id',
    loadComponent: () => import('./caregiver/caregiver-profile/caregiver-profile.component').then(m => m.CaregiverProfileComponent),
    canActivate: [authGuard]
  },
  {
    path: 'edit-profile',
    loadComponent: () => import('./caregiver/edit-caregiver-profile/edit-caregiver-profile.component').then(m => m.EditCaregiverProfileComponent),
    canActivate: [authGuard]
  },
  {
    path: 'notifications',
    loadComponent: () => import('./notifications/notifications-center.component').then(m => m.NotificationsCenterComponent),
    canActivate: [authGuard]
  }
];
