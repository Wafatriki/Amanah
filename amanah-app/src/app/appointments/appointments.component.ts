import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { ActiveDependentService } from '../services/active-dependent.service';
import { AppointmentService } from '../services/appointment.service';
import { AuthService } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { NotificationService } from '../services/notification.service';
import { Appointment } from '../models/appointment.model';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './appointments.component.html',
  styleUrls: ['./appointments.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppointmentsComponent implements OnInit, OnDestroy {
  activeDependentId: string | null = null;
  upcomingAppointments: Appointment[] = [];
  pastAppointments: Appointment[] = [];

  loadingUpcoming = false;
  loadingPast = false;
  error: string | null = null;

  selectedTab: 'upcoming' | 'history' = 'upcoming';
  selectedAppointment: Appointment | null = null;
  showDetailModal = false;
  showNoteForm = false;
  noteText = '';

  private destroy$ = new Subject<void>();

  constructor(
    private appointmentService: AppointmentService,
    private activeDependentService: ActiveDependentService,
    private authService: AuthService,
    public permissionService: PermissionService,
    private uiFeedbackService: UiFeedbackService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.activeDependentService.activeDependentId$
      .pipe(takeUntil(this.destroy$))
      .subscribe((id: string | null) => {
        this.activeDependentId = id;
        if (id) {
          this.loadAppointments();
        }
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAppointments(): void {
    if (!this.activeDependentId) return;

    this.error = null; // Clear any previous errors

    // Load upcoming appointments
    this.loadingUpcoming = true;
    this.appointmentService
      .getUpcomingAppointments(this.activeDependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (appointments: Appointment[]) => {
          this.upcomingAppointments = appointments;
          this.updateOverdueAppointments(this.upcomingAppointments);
          this.loadingUpcoming = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading upcoming appointments:', err);
          this.error = 'Error al cargar citas próximas';
          this.loadingUpcoming = false;
          this.cdr.markForCheck();
        }
      });

    // citas pasadas
    this.loadingPast = true;
    this.appointmentService
      .getAppointmentHistory(this.activeDependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (appointments: Appointment[]) => {
          this.pastAppointments = appointments;
          this.updateOverdueAppointments(this.pastAppointments);
          this.loadingPast = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading past appointments:', err);
          this.error = 'Error al cargar historial de citas';
          this.loadingPast = false;
          this.cdr.markForCheck();
        }
      });
  }

  private updateOverdueAppointments(appointments: Appointment[]): void {
    if (!this.activeDependentId) return;

    const dependentId = this.activeDependentId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    appointments.forEach((appointment) => {
      if (appointment.status === 'scheduled') {
        const appointmentDate = new Date(appointment.date);
        appointmentDate.setHours(0, 0, 0, 0);

        if (appointmentDate < today) {
          this.appointmentService
            .updateAppointmentStatus(dependentId, appointment.id!, 'overdue')
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: () => {
                appointment.status = 'overdue';
                this.cdr.markForCheck();
              },
              error: (err: any) => {
                console.error('Error updating overdue appointment status:', err);
              }
            });
        }
      }
    });
  }

  createAppointment(): void {
    this.router.navigate(['/appointments/new']);
  }

  editAppointment(id: string): void {
    this.router.navigate(['/appointments/form'], { queryParams: { id } });
  }

  completeAppointment(appointmentId: string): void {
    if (!this.activeDependentId) return;

    this.appointmentService
      .updateAppointmentStatus(this.activeDependentId, appointmentId, 'completed')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Reload appointments to move it to history
          this.loadAppointments();
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error completing appointment:', err);
          this.error = 'Error al marcar la cita como completada';
          this.cdr.markForCheck();
        }
      });
  }

  async cancelAppointment(appointmentId: string): Promise<void> {
    if (!this.activeDependentId || !this.selectedAppointment) return;

    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Cancelar cita',
      message: 'La cita se moverá al historial como cancelada.',
      confirmText: 'Cancelar cita',
      cancelText: 'Volver',
      dangerous: true
    });

    if (confirmed) {
      this.appointmentService
        .updateAppointmentStatus(this.activeDependentId, appointmentId, 'cancelled')
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.selectedAppointment!.status = 'cancelled';
            this.closeModal();
            this.cdr.markForCheck();
            this.notificationService.notifySuccess('Cita cancelada', 'La cita se movió al historial');
          },
          error: (err: any) => {
            console.error('Error cancelling appointment:', err);
            this.error = 'Error al cancelar la cita';
            this.cdr.markForCheck();
            this.notificationService.notifyError('Error', 'No se pudo cancelar la cita');
          }
        });
    }
  }

  async deleteAppointment(appointmentId: string): Promise<void> {
    if (!this.activeDependentId) return;

    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar cita',
      message: 'La cita se eliminará permanentemente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (confirmed) {
      this.appointmentService
        .deleteAppointment(this.activeDependentId, appointmentId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.closeModal();
            this.cdr.markForCheck();
            this.notificationService.notifySuccess('Cita eliminada', 'La cita se eliminó correctamente');
          },
          error: (err: any) => {
            console.error('Error deleting appointment:', err);
            this.error = 'Error al eliminar la cita';
            this.cdr.markForCheck();
            this.notificationService.notifyError('Error', 'No se pudo eliminar la cita');
          }
        });
    }
  }

  showDetails(appointment: Appointment): void {
    this.selectedAppointment = appointment;
    this.showDetailModal = true;
    this.showNoteForm = false;
    this.noteText = '';
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.showDetailModal = false;
    this.showNoteForm = false;
    this.selectedAppointment = null;
    this.noteText = '';
    this.cdr.markForCheck();
  }

  toggleNoteForm(): void {
    this.showNoteForm = !this.showNoteForm;
    this.cdr.markForCheck();
  }

  addPostAppointmentNote(): void {
    if (!this.selectedAppointment || !this.activeDependentId || !this.noteText.trim()) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) return;

    const note = {
      date: new Date(),
      text: this.noteText,
      userId: currentUser.uid,
      userName: currentUser.displayName || 'Anónimo'
    };

    this.appointmentService
      .addPostAppointmentNote(
        this.activeDependentId,
        this.selectedAppointment.id!,
        note
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Reload the selected appointment
          if (this.selectedAppointment) {
            const updatedAppointment =
              this.upcomingAppointments.find(a => a.id === this.selectedAppointment?.id) ||
              this.pastAppointments.find(a => a.id === this.selectedAppointment?.id);

            if (updatedAppointment) {
              this.selectedAppointment = updatedAppointment;
            }
          }
          this.noteText = '';
          this.showNoteForm = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error adding note:', err);
          this.error = 'Error al agregar nota';
          this.cdr.markForCheck();
        }
      });
  }

  updateStatus(appointmentId: string, event: any): void {
    if (!this.activeDependentId) return;

    const status = event.target.value as 'scheduled' | 'overdue' | 'cancelled';

    this.appointmentService
      .updateAppointmentStatus(this.activeDependentId, appointmentId, status)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        error: (err: any) => {
          console.error('Error updating status:', err);
          this.error = 'Error al actualizar estado';
          this.cdr.markForCheck();
        }
      });
  }

  trackByAppointmentId(index: number, appointment: Appointment): string {
    return appointment.id || index.toString();
  }

  get currentAppointments(): Appointment[] {
    return this.selectedTab === 'upcoming' ? this.upcomingAppointments : this.pastAppointments;
  }

  get currentLoading(): boolean {
    return this.selectedTab === 'upcoming' ? this.loadingUpcoming : this.loadingPast;
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'scheduled':
        return 'badge-scheduled';
      case 'completed':
        return 'badge-completed';
      case 'overdue':
        return 'badge-overdue';
      case 'cancelled':
        return 'badge-cancelled';
      default:
        return '';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'scheduled':
        return 'Programada';
      case 'completed':
        return 'Completada';
      case 'overdue':
        return 'Vencida';
      case 'cancelled':
        return 'Cancelada';
      default:
        return status;
    }
  }
}
