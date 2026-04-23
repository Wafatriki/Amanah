import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { DependentService } from '../../services/dependent.service';
import { MedicationService } from '../../services/medication.service';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { Medication, MedicationIntake } from '../../models/medication.model';
import { MedicationCalendarComponent } from '../medication-calendar/medication-calendar.component';
import { MedicationHistoryComponent } from '../medication-history/medication-history.component';
import { Subject, takeUntil } from 'rxjs';
import { UiFeedbackService } from '../../services/ui-feedback.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-medication-list',
  standalone: true,
  imports: [CommonModule, MedicationCalendarComponent, MedicationHistoryComponent],
  templateUrl: './medication-list.component.html',
  styleUrls: ['./medication-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MedicationListComponent implements OnInit, OnDestroy {
  medications: Medication[] = [];
  todaysMedications: MedicationIntake[] = [];

  activeDependentId: string | null = null;
  activeDependentName: string = '';
  currentUserId: string | null = null;

  loading = true;
  error: string | null = null;
  completingScheduleId: string | null = null;

  // Calendar and history
  showCalendar = false;
  showHistory = false;
  selectedMedicationForHistory: Medication | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private medicationService: MedicationService,
    private activeDependentService: ActiveDependentService,
    private dependentService: DependentService,
    private authService: AuthService,
    private permissionService: PermissionService,
    private uiFeedbackService: UiFeedbackService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.currentUserId = user?.uid || null;
    });

    this.activeDependentService.activeDependentId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(dependentId => {
        if (dependentId) {
          this.activeDependentId = dependentId;
          this.loadDependentName(dependentId);
          this.loadMedications();
          this.loadTodaysMedications();
        } else {
          this.loading = false;
          this.error = 'No hay dependiente seleccionado';
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMedications(): void {
    if (!this.activeDependentId) return;

    this.medicationService.getMedicationsByDependent(this.activeDependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (medications) => {
          this.medications = medications;
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = 'Error al cargar medicaciones';
          console.error(err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  loadDependentName(dependentId: string): void {
    this.dependentService.getDependent(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (dependent: any) => {
          if (dependent) {
            this.activeDependentName = dependent.name;
            this.cdr.markForCheck();
          }
        },
        error: (err: any) => {
          console.error('Error loading dependent name:', err);
        }
      });
  }

  loadTodaysMedications(): void {
    if (!this.activeDependentId) return;

    this.medicationService.getTodaysMedicationIntakes(this.activeDependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (intakes) => {
          this.todaysMedications = intakes;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading todays medications:', err);
        }
      });
  }

  toggleMedicationStatus(medication: Medication): void {
    if (!this.activeDependentId) return;

    this.medicationService
      .toggleMedicationActive(this.activeDependentId, medication.id!, !medication.isActive)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          medication.isActive = !medication.isActive;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = 'Error al cambiar estado de medicación';
          console.error(err);
        }
      });
  }

  onIntakeCheckChange(event: Event, medicationId: string, scheduleIndex: number): void {
    // Invitados no pueden marcar medicaciones como completadas
    if (this.permissionService.isReadOnly()) {
      (event.target as HTMLInputElement).checked = !(event.target as HTMLInputElement).checked;
      return;
    }

    const isChecked = (event.target as HTMLInputElement).checked;

    // 1️⃣ ACTUALIZAR EN todaysMedications
    const intakeIndex = this.todaysMedications.findIndex(
      i => i.medicationId === medicationId && i.scheduleIndex === scheduleIndex
    );

    if (intakeIndex > -1) {
      this.todaysMedications[intakeIndex].completed = isChecked;
    }

    // 2️⃣ ACTUALIZAR TAMBIÉN EN medications (para que no desaparezca el horario)
    const medication = this.medications.find(m => m.id === medicationId);
    if (medication && medication.schedules[scheduleIndex]) {
      // Actualizar completedDate localmente
      const today = new Date();
      const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      if (isChecked) {
        medication.schedules[scheduleIndex].lastCompletedDate = todayString;
        medication.schedules[scheduleIndex].completedAt = new Date();
      } else {
        medication.schedules[scheduleIndex].lastCompletedDate = undefined;
        medication.schedules[scheduleIndex].completedAt = undefined;
      }
    }

    this.cdr.markForCheck();

    // 3️⃣ GUARDAR EN FIRESTORE EN BACKGROUND (sin esperar)
    if (isChecked) {
      this.medicationService
        .markScheduleCompleted(this.activeDependentId!, medicationId, scheduleIndex)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          error: (err) => {
            console.error('Error saving completion:', err);
            // Revertir si falla
            if (intakeIndex > -1) {
              this.todaysMedications[intakeIndex].completed = false;
            }
            if (medication && medication.schedules[scheduleIndex]) {
              medication.schedules[scheduleIndex].lastCompletedDate = undefined;
              medication.schedules[scheduleIndex].completedAt = undefined;
            }
            this.cdr.markForCheck();
          }
        });
    } else {
      this.medicationService
        .markScheduleIncomplete(this.activeDependentId!, medicationId, scheduleIndex)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          error: (err) => {
            console.error('Error clearing completion:', err);
            // Revertir si falla
            if (intakeIndex > -1) {
              this.todaysMedications[intakeIndex].completed = true;
            }
            if (medication && medication.schedules[scheduleIndex]) {
              const today = new Date();
              const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              medication.schedules[scheduleIndex].lastCompletedDate = todayString;
              medication.schedules[scheduleIndex].completedAt = new Date();
            }
            this.cdr.markForCheck();
          }
        });
    }
  }

  markScheduleCompleted(medicationId: string, scheduleIndex: number): void {
    if (!this.activeDependentId) return;

    this.completingScheduleId = `${medicationId}-${scheduleIndex}`;
    this.medicationService
      .markScheduleCompleted(this.activeDependentId, medicationId, scheduleIndex)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.completingScheduleId = null;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = 'Error al marcar dosis como completada';
          console.error(err);
          this.completingScheduleId = null;
          this.cdr.markForCheck();
        }
      });
  }

  markScheduleIncomplete(medicationId: string, scheduleIndex: number): void {
    if (!this.activeDependentId) return;

    this.completingScheduleId = `${medicationId}-${scheduleIndex}`;
    this.medicationService
      .markScheduleIncomplete(this.activeDependentId, medicationId, scheduleIndex)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.completingScheduleId = null;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = 'Error al marcar dosis como incompleta';
          console.error(err);
          this.completingScheduleId = null;
          this.cdr.markForCheck();
        }
      });
  }

  editMedication(medicationId: string): void {
    // Solo cuidadores pueden editar
    if (this.permissionService.isReadOnly()) {
      this.notificationService.notifyError('Sin permisos', 'No tienes permisos para editar medicaciones');
      return;
    }
    this.router.navigate(['/medications/edit', medicationId]);
  }

  async deleteMedication(medicationId: string): Promise<void> {
    if (!this.activeDependentId) return;

    // Solo cuidadores pueden eliminar
    if (this.permissionService.isReadOnly()) {
      this.notificationService.notifyError('Sin permisos', 'No tienes permisos para eliminar medicaciones');
      return;
    }

    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar medicación',
      message: 'La medicación se eliminará de forma permanente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (confirmed) {
      this.medicationService
        .deleteMedication(this.activeDependentId, medicationId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.medications = this.medications.filter(m => m.id !== medicationId);
            this.cdr.markForCheck();
            this.notificationService.notifySuccess('Medicación eliminada', 'La medicación se eliminó correctamente');
          },
          error: (err) => {
            this.error = 'Error al eliminar medicación';
            console.error(err);
            this.notificationService.notifyError('Error', 'No se pudo eliminar la medicación');
          }
        });
    }
  }

  createNewMedication(): void {
    this.router.navigate(['/medications/new']);
  }

  canCreateMedication(): boolean {
    return !this.permissionService.isReadOnly();
  }

  canEditMedication(): boolean {
    return !this.permissionService.isReadOnly();
  }

  canDeleteMedication(): boolean {
    return !this.permissionService.isReadOnly();
  }

  getScheduleStatus(medication: Medication, scheduleIndex: number): string {
    const schedule = medication.schedules?.[scheduleIndex];

    // Validar que exista el schedule
    if (!schedule) {
      return 'pending';
    }

    // Si ya está completado, retornar completed
    if (schedule.completed) {
      return 'completed';
    }

    // Validar que schedule.time exista y sea una cadena
    if (!schedule.time || typeof schedule.time !== 'string') {
      return 'pending';
    }

    try {
      const now = new Date();
      const timeParts = schedule.time.split(':');

      // Validar que el formato sea correcto (HH:mm)
      if (timeParts.length < 2) {
        return 'pending';
      }

      const [hours, minutes] = timeParts.map(Number);

      // Validar que las horas y minutos sean números válidos
      if (isNaN(hours) || isNaN(minutes)) {
        return 'pending';
      }

      const scheduleTime = new Date();
      scheduleTime.setHours(hours, minutes, 0, 0);

      return now < scheduleTime ? 'pending' : 'overdue';
    } catch (error) {
      console.error('Error parsing schedule time:', error);
      return 'pending';
    }
  }

  getMedicationIcon(presentation: string): string {
    const lower = presentation.toLowerCase();
    // Devolver rutas de iconos en lugar de emojis
    if (lower.includes('cápsula') || lower.includes('capsula')) return '/assets/medication-icons/capsula.png';
    if (lower.includes('comprimido') || lower.includes('tableta')) return '/assets/medication-icons/tableta (1).png';
    if (lower.includes('jarabe')) return '/assets/medication-icons/jarabe (1).png';
    if (lower.includes('inyección') || lower.includes('jeringa')) return '/assets/medication-icons/jeringuilla.png';
    if (lower.includes('gota')) return '/assets/medication-icons/gotas-para-los-ojos.png';
    if (lower.includes('crema')) return '/assets/medication-icons/crema.png';
    return '/assets/medication-icons/pastillas.png'; // Default
  }

  toggleCalendar(): void {
    this.showCalendar = !this.showCalendar;
    if (this.showCalendar) {
      this.showHistory = false;
      this.selectedMedicationForHistory = null;
    }
    this.cdr.markForCheck();
  }

  toggleHistory(): void {
    this.showHistory = !this.showHistory;
    if (this.showHistory) {
      this.showCalendar = false;
    }
    this.cdr.markForCheck();
  }

  openMedicationHistory(medication: Medication): void {
    this.selectedMedicationForHistory = medication;
    this.showHistory = true;
    this.showCalendar = false;
    this.cdr.markForCheck();
  }

  closeHistory(): void {
    this.showHistory = false;
    this.selectedMedicationForHistory = null;
    this.cdr.markForCheck();
  }

  trackByMedicationId(index: number, medication: Medication): string {
    return medication.id || index.toString();
  }

  trackByScheduleIndex(index: number): number {
    return index;
  }

  trackByIntakeId(index: number, intake: MedicationIntake): string {
    return `${intake.medicationId}-${intake.scheduleIndex}`;
  }

  trackByObservationIndex(index: number): number {
    return index;
  }
}
