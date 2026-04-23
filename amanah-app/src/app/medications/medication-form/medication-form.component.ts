import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormArray, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { MedicationService } from '../../services/medication.service';
import { AuthService } from '../../services/auth.service';
import { Medication, MedicationSchedule } from '../../models/medication.model';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-medication-form',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './medication-form.component.html',
  styleUrls: ['./medication-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MedicationFormComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  activeDependentId: string | null = null;
  currentUserId: string | null = null;
  medicationId: string | null = null;

  loading = false;
  submitting = false;
  submitted = false;
  error: string | null = null;
  editMode = false;

  private destroy$ = new Subject<void>();

  constructor(
    private fb: FormBuilder,
    private medicationService: MedicationService,
    private activeDependentService: ActiveDependentService,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(user => {
      this.currentUserId = user?.uid || null;
    });

    this.activeDependentService.activeDependentId$
      .pipe(takeUntil(this.destroy$))
      .subscribe(dependentId => {
        this.activeDependentId = dependentId;
      });

    this.route.params.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['id']) {
        this.medicationId = params['id'];
        this.editMode = true;
        this.loadMedication();
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.form = this.fb.group({
      name: ['', Validators.required],
      dose: ['', Validators.required],
      presentation: ['cápsulas', Validators.required],
      activeIngredient: [''],
      schedules: this.fb.array([this.createScheduleControl()]),
      indication: [''],
      startDate: [new Date().toISOString().split('T')[0], Validators.required],
      endDate: [''],
      prescribedBy: [''],
      isActive: [true]
    });
  }

  private createScheduleControl(): FormGroup {
    return this.fb.group({
      time: ['08:00', Validators.required],
      dosage: ['', Validators.required],
      notes: [''],
      reminder: this.fb.group({
        enabled: [false],
        minutesBefore: [15, Validators.required]
      })
    });
  }

  get schedulesArray(): FormArray {
    return this.form.get('schedules') as FormArray;
  }

  addSchedule(): void {
    this.schedulesArray.push(this.createScheduleControl());
    this.cdr.markForCheck();
  }

  removeSchedule(index: number): void {
    if (this.schedulesArray.length > 1) {
      this.schedulesArray.removeAt(index);
      this.cdr.markForCheck();
    }
  }

  private loadMedication(): void {
    if (!this.activeDependentId || !this.medicationId) return;

    this.loading = true;
    this.medicationService
      .getMedicationsByDependent(this.activeDependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (medications) => {
          const medication = medications.find(m => m.id === this.medicationId);
          if (medication) {
            this.populateForm(medication);
          } else {
            this.error = 'Medicación no encontrada';
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = 'Error al cargar medicación';
          console.error(err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  private populateForm(medication: Medication): void {
    // Clear existing schedules
    while (this.schedulesArray.length > 0) {
      this.schedulesArray.removeAt(0);
    }

    // Populate basic info
    this.form.patchValue({
      name: medication.name,
      dose: medication.dose,
      presentation: medication.presentation,
      activeIngredient: medication.activeIngredient,
      indication: medication.indication,
      startDate: this.formatDate(medication.startDate),
      endDate: medication.endDate ? this.formatDate(medication.endDate) : '',
      prescribedBy: medication.prescribedBy,
      isActive: medication.isActive
    });

    // Populate schedules
    medication.schedules.forEach(schedule => {
      const reminderData = schedule.reminder || { enabled: false, minutesBefore: 15 };
      this.schedulesArray.push(
        this.fb.group({
          time: [schedule.time, Validators.required],
          dosage: [schedule.dosage, Validators.required],
          notes: [schedule.notes || ''],
          reminder: this.fb.group({
            enabled: [Boolean(reminderData.enabled), Validators.required],
            minutesBefore: [Number.parseInt(String(reminderData.minutesBefore || 15), 10), Validators.required]
          })
        })
      );
    });
  }

  private formatDate(date: Date): string {
    if (!date) return '';
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  onSubmit(): void {
    this.submitted = true;

    if (!this.form.valid || !this.activeDependentId || !this.currentUserId) {
      this.error = 'Por favor, completa todos los campos requeridos';
      this.cdr.markForCheck();
      return;
    }

    this.submitting = true;
    this.error = null;

    const medication: Medication = {
      dependentId: this.activeDependentId,
      name: this.form.value.name,
      dose: this.form.value.dose,
      presentation: this.form.value.presentation,
      activeIngredient: this.form.value.activeIngredient,
      schedules: this.form.value.schedules.map((s: any) => ({
        time: s.time,
        dosage: s.dosage,
        notes: s.notes,
        completed: false,
        reminder: {
          enabled: s.reminder?.enabled || false,
          minutesBefore: Number.parseInt(String(s.reminder?.minutesBefore || 15), 10)
        }
      })),
      indication: this.form.value.indication,
      startDate: new Date(this.form.value.startDate),
      endDate: this.form.value.endDate ? new Date(this.form.value.endDate) : undefined,
      prescribedBy: this.form.value.prescribedBy,
      isActive: this.form.value.isActive,
      observations: [],
      history: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: this.currentUserId
    };

    if (this.editMode && this.medicationId) {
      this.medicationService
        .updateMedication(this.activeDependentId, this.medicationId, medication)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.submitting = false;
            this.router.navigate(['/medications']);
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.error = 'Error al actualizar medicación';
            console.error(err);
            this.submitting = false;
            this.cdr.markForCheck();
          }
        });
    } else {
      this.medicationService
        .createMedication(this.activeDependentId, medication)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.submitting = false;
            this.router.navigate(['/medications']);
            this.cdr.markForCheck();
          },
          error: (err) => {
            this.error = 'Error al crear medicación';
            console.error(err);
            this.submitting = false;
            this.cdr.markForCheck();
          }
        });
    }
  }

  onCancel(): void {
    this.router.navigate(['/medications']);
  }
}
