import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, firstValueFrom } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Dependent } from '../../models/dependent.model';
import { User } from '../../models/user.model';
import { Medication } from '../../models/medication.model';
import { Task } from '../../models/task.model';
import { Appointment } from '../../models/appointment.model';
import { DependentService } from '../../services/dependent.service';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { AuthService } from '../../services/auth.service';
import { MedicationService } from '../../services/medication.service';
import { PermissionService } from '../../services/permission.service';
import { TaskService } from '../../services/task.service';
import { AppointmentService } from '../../services/appointment.service';
import { DeleteDependentModalComponent } from '../delete-dependent-modal/delete-dependent-modal.component';
import { ExportDataComponent } from '../export-data/export-data.component';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-dependent-detail',
  standalone: true,
  imports: [CommonModule, DeleteDependentModalComponent, ExportDataComponent],
  templateUrl: './dependent-detail.component.html',
  styleUrl: './dependent-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DependentDetailComponent implements OnInit, OnDestroy {
  dependent: Dependent | null = null;
  caregivers: User[] = [];
  medications: Medication[] = [];
  tasks: Task[] = [];
  appointments: Appointment[] = [];
  loading = true;
  showDeleteModal = false;
  showExportModal = false;
  showProfileTab = true;
  showOthersTab = false;
  otherDependents: Dependent[] = [];
  dependentId: string | null = null;

  private readonly destroy$ = new Subject<void>();


  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly dependentService: DependentService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly authService: AuthService,
    private readonly medicationService: MedicationService,
    private readonly permissionService: PermissionService,
    private readonly taskService: TaskService,
    private readonly appointmentService: AppointmentService,
    private readonly notificationService: NotificationService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const id = params['id'];
      console.log('Route params received:', params);
      if (id) {
        this.dependentId = id;
        this.verifyOwnershipAndLoad(id);
      } else {
        console.warn('No id in route params');
        this.router.navigate(['/dependent-selector']);
      }
    });
  }

  async verifyOwnershipAndLoad(id: string): Promise<void> {
    try {
      // Verify that the current user is either the owner or a caregiver of this dependent
      const dependent = await firstValueFrom(this.dependentService.getDependent(id));

      if (!dependent) {
        console.warn('Dependent not found');
        this.router.navigate(['/dependent-selector']);
        return;
      }

      const currentUser = this.authService.getCurrentUser();

      // Check if the current user is the owner (createdBy field)
      const isOwner = dependent.createdBy === currentUser?.uid;

      // Check if the current user is a caregiver of this dependent
      let isCaregiver = false;
      if (!isOwner) {
        const caregivers = await this.dependentService.getCaregiversForDependent(id);
        isCaregiver = caregivers.some(c => c.userId === currentUser?.uid);
      }

      // Allow access if user is owner OR caregiver
      if (!isOwner && !isCaregiver) {
        console.warn('User is neither owner nor caregiver of this dependent. Redirecting to dependent-selector.');
        setTimeout(() => {
          this.router.navigate(['/dependent-selector']);
        }, 1000);
        return;
      }

      this.loadDependent(id);
      this.loadCaregivers(id);
      this.loadMedications(id);
      this.loadAppointments(id);
      this.loadTasks(id);
      this.loadOtherDependents();
    } catch (error) {
      console.error('Error verifying ownership:', error);
      this.router.navigate(['/dependent-selector']);
    }
  }

  loadDependent(id: string): void {
    console.log('Loading dependent with id:', id);
    this.loading = true;


    this.dependentService
      .getDependent(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (dependent) => {
          console.log('Dependent loaded:', dependent);
          if (!dependent) {
            console.warn('Dependent is null, redirecting...');
            this.router.navigate(['/dependent-selector']);
            return;
           }
          this.dependent = dependent;
          this.loading = false;
          console.log('After update - loading:', this.loading, 'dependent:', this.dependent);

            this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading dependent:', err);
          this.loading = false;
          this.cdr.markForCheck();
          this.router.navigate(['/dependent-selector']);
        },
      });
  }

  loadCaregivers(dependentId: string): void {
    this.dependentService.getCaregiversForDependent(dependentId).then((caregivers) => {
      this.caregivers = caregivers;
      this.cdr.markForCheck();
    }).catch((error) => {
      console.error('Error loading caregivers:', error);
      this.caregivers = [];
    });
  }

  loadMedications(dependentId: string): void {
    this.medicationService.getMedicationsByDependent(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (medications) => {
          this.medications = medications;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading medications:', err);
          this.medications = [];
          this.cdr.markForCheck();
        }
      });
  }

  loadAppointments(dependentId: string): void {
    this.appointmentService.getAppointmentsByDependent(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (appointments) => {
          this.appointments = appointments;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading appointments:', err);
          this.appointments = [];
          this.cdr.markForCheck();
        }
      });
  }

  loadTasks(dependentId: string): void {
    this.taskService.getTasksByDependentLive(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tasks) => {
          this.tasks = tasks;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading tasks:', err);
          this.tasks = [];
          this.cdr.markForCheck();
        }
      });
  }

  getRoleLabel(role: string): string {
    const roleLabels: Record<string, string> = {
      'primary_caregiver': 'Cuidador Principal',
      'collaborative_caregiver': 'Cuidador Colaborativo',
      'invited': 'Invitado'
    };
    return roleLabels[role] || role;
  }

  canEditDependent(): boolean {
    return this.permissionService.canEditDependent();
  }

  canDeleteDependent(): boolean {
    return this.permissionService.canDeleteDependent();
  }

  editDependent(): void {
    if (this.dependentId) {
      this.router.navigate(['/edit-dependent', this.dependentId]);
    }
  }

  openDeleteModal(): void {
    this.showDeleteModal = true;
  }

  closeDeleteModal(): void {
    this.showDeleteModal = false;
  }

  openExportModal(): void {
    // Check if user is primary caregiver
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser || !this.dependent) return;

    const isPrimaryCaregiver = this.caregivers.some(
      caregiver => caregiver.userId === currentUser.uid && caregiver.role === 'primary_caregiver'
    );

    if (!isPrimaryCaregiver) {
      this.notificationService.notifyError('Sin permisos', 'Solo el cuidador principal puede exportar la información del dependiente');
      return;
    }

    this.showExportModal = true;
  }

  closeExportModal(): void {
    this.showExportModal = false;
  }

  goBack(): void {
    this.router.navigate(['/dependent-selector']);
  }

  loadOtherDependents(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      console.error('No current user found');
      this.otherDependents = [];
      return;
    }

    this.dependentService
      .getDependentsForUser(currentUser.uid)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (dependents) => {
          // Filter out current dependent from the list
          this.otherDependents = dependents.filter(dep => dep.id !== this.dependentId);
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading other dependents:', err);
          this.otherDependents = [];
          this.cdr.markForCheck();
        },
      });
  }

  selectOtherDependent(dependent: Dependent): void {
    if (dependent.id) {
      this.activeDependentService.setActiveDependentId(dependent.id);

      // Obtener el rol del usuario para este dependiente
      this.dependentService.getCaregiversForDependent(dependent.id)
        .then(caregivers => {
          const currentUser = this.authService.getCurrentUser();
          if (currentUser) {
            const userCaregiver = caregivers.find(c => c.userId === currentUser.uid);
            if (userCaregiver) {
              this.activeDependentService.setActiveDependentRole(
                userCaregiver.role as 'primary_caregiver' | 'collaborative_caregiver' | 'invited'
              );
              console.log('User role for selected dependent:', userCaregiver.role);
            }
          }
        });

      this.dependentId = dependent.id;
      this.showProfileTab = true;
      this.showOthersTab = false;
      this.loadDependent(dependent.id);
      this.loadCaregivers(dependent.id);
      this.loadOtherDependents();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Reemplaza la imagen por un avatar SVG con un emoji si la carga falla
   * Evita errores en las plantillas que llaman (error)="replaceWithEmojiAvatar($event)"
   */
  replaceWithEmojiAvatar(event: Event): void {
    try {
      const img = event?.target as HTMLImageElement | null;
      if (!img) return;

      const emoji = '👤';
      const bg = '#EDE7F6';
      const svg = `<?xml version="1.0" encoding="UTF-8"?><svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-size='64'>${emoji}</text></svg>`;
      img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
    } catch (err) {
      console.warn('replaceWithEmojiAvatar error:', err);
    }
  }

}
