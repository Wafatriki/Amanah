import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { AppointmentService } from '../../services/appointment.service';
import { AuthService } from '../../services/auth.service';
import { DependentService } from '../../services/dependent.service';
import { Appointment } from '../../models/appointment.model';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-appointment-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './appointment-form.component.html',
  styleUrls: ['./appointment-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppointmentFormComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  activeDependentId: string | null = null;
  currentUserId: string | null = null;
  appointmentId: string | null = null;

  loading = false;
  submitting = false;
  submitted = false;
  error: string | null = null;
  editMode = false;
  showDocumentUpload = false;

  caregivers: any[] = [];
  selectedCaregiverIds: string[] = [];
  customSpecialty: string = '';

  specialties = [
    'Medicina General',
    'Análisis de Sangre',
    'Cardiología',
    'Neurología',
    'Oftalmología',
    'Otorrinolaringología',
    'Dermatología',
    'Gastroenterología',
    'Neumología',
    'Endocrinología',
    'Traumatología',
    'Psicología',
    'Otro'
  ];

  appointmentStatuses = [
    { value: 'scheduled', label: 'Programada' },
    { value: 'completed', label: 'Completada' },
    { value: 'overdue', label: 'Vencida' },
    { value: 'cancelled', label: 'Cancelada' }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private appointmentService: AppointmentService,
    private activeDependentService: ActiveDependentService,
    private authService: AuthService,
    private dependentService: DependentService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe((user: any) => {
      this.currentUserId = user?.uid || null;
    });

    this.activeDependentService.activeDependentId$
      .pipe(takeUntil(this.destroy$))
      .subscribe((id: any) => {
        this.activeDependentId = id;
        if (id) {
          this.loadCaregivers();
        }
        this.cdr.markForCheck();
      });

    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params: any) => {
      this.appointmentId = params['id'] || null;
      if (this.appointmentId) {
        this.editMode = true;
        this.loadAppointment();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.form = this.fb.group({
      date: ['', Validators.required],
      time: ['', Validators.required],
      specialty: ['', Validators.required],
      location: ['', Validators.required],
      doctor: [''],
      reason: [''],
      notes: [''],
      status: ['scheduled', Validators.required],
      duration: [],
      reminder: this.fb.group({
        enabled: [false],
        minutesBefore: [60, Validators.required]
      })
    });
  }

  private loadAppointment(): void {
    if (!this.activeDependentId || !this.appointmentId) return;

    this.loading = true;
    this.cdr.markForCheck();

    this.appointmentService
      .getAppointmentsByDependent(this.activeDependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (appointments: any) => {
          const appointment = appointments.find((a: any) => a.id === this.appointmentId);
          if (appointment) {
            this.populateForm(appointment);
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          this.error = 'Error al cargar la cita';
          console.error(err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private populateForm(appointment: Appointment): void {
    const date = appointment.date instanceof Date
      ? appointment.date
      : new Date(appointment.date);








    // Verificar si la especialidad está en la lista predefinida
    const isSpecialtyInList = this.specialties.includes(appointment.specialty);
    const specialtyValue = isSpecialtyInList ? appointment.specialty : 'Otro';

    // Si no está en la lista, guardar como especialidad personalizada
    if (!isSpecialtyInList) {
      this.customSpecialty = appointment.specialty;
    }








    this.form.patchValue({
      date: this.formatDate(date),
      time: appointment.time,
      specialty: specialtyValue,
      location: appointment.location,
      doctor: appointment.doctor || '',
      reason: appointment.reason || '',
      notes: appointment.notes || '',
      status: appointment.status,
      duration: appointment.duration || '',
      reminder: {
        enabled: Boolean(appointment.reminder?.enabled),
        minutesBefore: Number.parseInt(String(appointment.reminder?.minutesBefore || 60), 10)
      }
    });





    // Cargar cuidadores seleccionados anteriormente
    if (appointment.assignedCaregiverIds && appointment.assignedCaregiverIds.length > 0) {
      this.selectedCaregiverIds = [...appointment.assignedCaregiverIds];
      this.cdr.markForCheck();
    }
  }

  private loadCaregivers(): void {
    if (!this.activeDependentId) return;

    this.dependentService.getCaregiversForDependent(this.activeDependentId)
      .then((caregivers: any) => {
        console.log('Caregivers loaded:', caregivers);
        this.caregivers = caregivers;
        this.cdr.markForCheck();
      })
      .catch((err: any) => {
        console.error('Error loading caregivers:', err);
        this.error = 'Error al cargar cuidadores';
        this.cdr.markForCheck();
      });
  }

  toggleCaregiverSelection(caregiverId: string): void {
    const index = this.selectedCaregiverIds.indexOf(caregiverId);
    if (index > -1) {
      // Remover: crear nuevo array sin el elemento
      this.selectedCaregiverIds = this.selectedCaregiverIds.filter(id => id !== caregiverId);
    } else {
      // añdir: crear nuevo array con el elemento
      this.selectedCaregiverIds = [...this.selectedCaregiverIds, caregiverId];
    }
    this.cdr.markForCheck();
  }

  isCaregiverSelected(caregiverId: string): boolean {
    return this.selectedCaregiverIds.includes(caregiverId);
  }

  trackByCaregiverId(index: number, caregiver: any): string {
    return caregiver.userId;
  }

  onSubmit(): void {
    this.submitted = true;
    console.log('=== SUBMIT START ===');
    console.log('Form valid:', this.form.valid);
    console.log('Form errors:', this.form.errors);
    console.log('Form status:', this.form.status);

    console.log('date:', this.form.get('date')?.value, '| errors:', this.form.get('date')?.errors);
    console.log('time:', this.form.get('time')?.value, '| errors:', this.form.get('time')?.errors);
    console.log('specialty:', this.form.get('specialty')?.value, '| errors:', this.form.get('specialty')?.errors);
    console.log('location:', this.form.get('location')?.value, '| errors:', this.form.get('location')?.errors);
    console.log('status:', this.form.get('status')?.value, '| errors:', this.form.get('status')?.errors);

    console.log('Active dependent ID:', this.activeDependentId);
    console.log('Current user ID:', this.currentUserId);
    console.log('Selected caregiver IDs:', this.selectedCaregiverIds);

    if (this.form.invalid || !this.activeDependentId || !this.currentUserId) {
      console.log('BLOCKED: Form invalid or missing dependent/user');
      return;
    }

    if (this.form.get('specialty')?.value === 'Otro' && !this.customSpecialty.trim()) {
      this.error = 'Debes especificar la especialidad personalizada';
      console.log('BLOCKED: Custom specialty required');
      this.cdr.markForCheck();
      return;
    }

    if (this.selectedCaregiverIds.length === 0) {
      this.error = 'Debes asignar al menos un cuidador';
      console.log('BLOCKED: No caregivers selected');
      this.cdr.markForCheck();
      return;
    }

    this.submitting = true;
    this.error = null;
    this.cdr.markForCheck();

    const formValue = this.form.value;
    const dateStr = formValue.date;
    const timeStr = formValue.time;

    // si selecciona otro, usa la especialidad personalizada
    const specialty = formValue.specialty === 'Otro' ? this.customSpecialty : formValue.specialty;

    const appointmentDate = new Date(`${dateStr}T${timeStr}`);
    console.log('Appointment date:', appointmentDate);

    // Obtener nombres de cuidadores seleccionados
    const assignedCaregiverNames = this.caregivers
      .filter(c => this.selectedCaregiverIds.includes(c.userId))
      .map(c => c.name || 'Sin nombre');

    console.log('Assigned caregiver names:', assignedCaregiverNames);

    const appointmentData: Appointment = {
      dependentId: this.activeDependentId,
      date: appointmentDate,
      time: timeStr,
      specialty: specialty,
      location: formValue.location,
      doctor: formValue.doctor || undefined,
      reason: formValue.reason || undefined,
      notes: formValue.notes || undefined,
      status: formValue.status || 'scheduled',
      postAppointmentNotes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: this.currentUserId,
      duration: formValue.duration ? parseInt(formValue.duration, 10) : undefined,
      assignedCaregiverIds: this.selectedCaregiverIds,
      assignedCaregiverNames: assignedCaregiverNames,
      reminder: {
        enabled: formValue.reminder?.enabled || false,
        minutesBefore: Number.parseInt(String(formValue.reminder?.minutesBefore || 60), 10)
      }
    };

    if (this.editMode && this.appointmentId) {
      console.log('UPDATE MODE');
      this.appointmentService
        .updateAppointment(this.activeDependentId!, this.appointmentId, appointmentData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            console.log('Appointment updated successfully');
            this.submitting = false;
            this.router.navigate(['/appointments']);
            this.cdr.markForCheck();
          },
          error: (err: any) => {
            this.error = 'Error al guardar la cita. Intenta de nuevo.';
            console.error('Update error:', err);
            this.submitting = false;
            this.cdr.markForCheck();
          }
        });
    } else {
      console.log('CREATE MODE');
      this.appointmentService
        .createAppointment(this.activeDependentId!, appointmentData)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (id: string) => {
            console.log('Appointment created with ID:', id);
            this.submitting = false;
            this.router.navigate(['/appointments']);
            this.cdr.markForCheck();
          },
          error: (err: any) => {
            this.error = 'Error al guardar la cita. Intenta de nuevo.';
            console.error('Create error:', err);
            this.submitting = false;
            this.cdr.markForCheck();
          }
        });
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  goBack(): void {
    this.router.navigate(['/appointments']);
  }

  onDocumentUploaded(): void {
    this.showDocumentUpload = false;
    this.cdr.markForCheck();
  }
}
