import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { CalendarEvent, EventType } from '../../models/calendar-event.model';
import { CalendarEventService } from '../../services/calendar-event.service';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { UiFeedbackService } from '../../services/ui-feedback.service';
import { NotificationService } from '../../services/notification.service';

type RecurrenceType = 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';

interface RecurrenceOption {
  frequency: RecurrenceType;
  endsAfterDays?: number;
}

@Component({
  selector: 'app-calendar-event-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './calendar-event-form.component.html',
  styleUrl: './calendar-event-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarEventFormComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  eventId: string | null = null;
  dependentId: string | null = null;
  isEditMode = false;
  loading = false;
  submitting = false;

  eventTypes: { label: string; value: EventType }[] = [
    { label: 'Tarea', value: 'task' },
    { label: 'Cita Médica', value: 'appointment' },
    { label: 'Medicación', value: 'medication' },
    { label: 'Otro', value: 'other' },
  ];

  recurrenceTypes: { label: string; value: RecurrenceType }[] = [
    { label: 'No se repite', value: 'never' },
    { label: 'Diariamente', value: 'daily' },
    { label: 'Semanalmente', value: 'weekly' },
    { label: 'Mensualmente', value: 'monthly' },
    { label: 'Anualmente', value: 'yearly' },
  ];

  reminderOptions = [
    { label: 'Sin recordatorio', value: 0 },
    { label: '5 minutos antes', value: 5 },
    { label: '15 minutos antes', value: 15 },
    { label: '30 minutos antes', value: 30 },
    { label: '1 hora antes', value: 60 },
    { label: '1 día antes', value: 1440 },
  ];

  private readonly destroy$ = new Subject<void>();

  get showRecurrenceOptions(): boolean {
    return this.form.get('recurrence.frequency')?.value !== 'never';
  }

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly calendarEventService: CalendarEventService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly uiFeedbackService: UiFeedbackService,
    private readonly notificationService: NotificationService,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    this.dependentId = this.activeDependentService.getActiveDependentId();

    if (!this.dependentId) {
      this.router.navigate(['/dependent-selector']);
      return;
    }

    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const id = params.get('id');
      if (id) {
        this.eventId = id;
        this.isEditMode = true;
        this.loadEvent(id);
      }
    });

    // Pre-fill start date from query params if creating new event
    if (!this.isEditMode) {
      this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
        if (params['date']) {
          const date = new Date(params['date']);
          this.form.patchValue({
            startDate: date.toISOString().split('T')[0],
            endDate: date.toISOString().split('T')[0],
          });
        }
      });
    }
  }

  private initializeForm(): void {
    this.form = this.formBuilder.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      type: ['task', Validators.required],
      startDate: ['', Validators.required],
      startTime: ['09:00'],
      endDate: ['', Validators.required],
      endTime: ['10:00'],
      notes: [''],
      recurrence: this.formBuilder.group({
        frequency: ['never'],
        endsAfterDays: [30],
      }),
      reminder: this.formBuilder.group({
        enabled: [false],
        minutesBefore: [15],
      }),
    });
  }

  private loadEvent(eventId: string): void {
    this.loading = true;
    this.calendarEventService
      .getEvent(eventId, this.dependentId!)
      .then((event) => {
        if (event) {
          this.populateForm(event);
        } else {
          console.error('Event not found');
          this.router.navigate(['/calendar']);
        }
        this.loading = false;
        this.cdr.markForCheck();
      })
      .catch((error) => {
        console.error('Error loading event:', error);
        this.loading = false;
        this.cdr.markForCheck();
        this.router.navigate(['/calendar']);
      });
  }

  private populateForm(event: CalendarEvent): void {
    const startDate = new Date(event.startDate);
    const endDate = new Date(event.endDate);

    this.form.patchValue({
      title: event.title,
      description: event.description,
      type: event.type,
      startDate: startDate.toISOString().split('T')[0],
      startTime: startDate.toTimeString().slice(0, 5),
      endDate: endDate.toISOString().split('T')[0],
      endTime: endDate.toTimeString().slice(0, 5),
      notes: event.notes,
      reminder: {
        enabled: event.reminder || false,
        minutesBefore: event.reminderTime || 15,
      },
    });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.dependentId) {
      return;
    }

    this.submitting = true;

    try {
      const formValue = this.form.value;

      // Crear fecha/hora combinadas
      const startDateTime = new Date(`${formValue.startDate}T${formValue.startTime}`);
      const endDateTime = new Date(`${formValue.endDate}T${formValue.endTime}`);

      // Always create a valid recurrence object
      const recurrenceConfig = {
        frequency: formValue.recurrence.frequency,
        endsAfterDays: formValue.recurrence.frequency !== 'never'
          ? (formValue.recurrence.endsAfterDays || 30)
          : null,
      };

      const eventData: Partial<CalendarEvent> = {
        title: formValue.title,
        description: formValue.description,
        type: formValue.type,
        startDate: startDateTime,
        endDate: endDateTime,
        dependentId: this.dependentId,
        notes: formValue.notes,
        reminder: formValue.reminder.enabled,
        reminderTime: formValue.reminder.enabled ? formValue.reminder.minutesBefore : 0,
        recurrence: recurrenceConfig,
      };

      if (this.isEditMode && this.eventId) {
        await this.calendarEventService.updateEvent(this.eventId, eventData, this.dependentId!);
      } else {
        const createdId = await this.calendarEventService.createEvent(eventData as CalendarEvent);
        console.log('Event created with ID:', createdId);
      }

      this.submitting = false;
      this.cdr.markForCheck();
      this.router.navigate(['/calendar']);
    } catch (error) {
      console.error('Error saving event:', error);
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }

  async onDelete(): Promise<void> {
    if (!this.eventId) {
      return;
    }

    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar evento',
      message: 'El evento se eliminará de forma permanente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (!confirmed) {
      return;
    }

    this.submitting = true;

    try {
      await this.calendarEventService.deleteEvent(this.eventId, this.dependentId!);
      this.submitting = false;
      this.cdr.markForCheck();
      this.notificationService.notifySuccess('Evento eliminado', 'El evento se eliminó correctamente');
      this.router.navigate(['/calendar']);
    } catch (error) {
      console.error('Error deleting event:', error);
      this.submitting = false;
      this.cdr.markForCheck();
      this.notificationService.notifyError('Error', 'No se pudo eliminar el evento');
    }
  }

  onCancel(): void {
    this.router.navigate(['/calendar']);
  }

  get titleError(): string | null {
    const titleControl = this.form.get('title');
    if (titleControl?.hasError('required')) return 'El título es requerido';
    if (titleControl?.hasError('minlength')) return 'El título debe tener al menos 3 caracteres';
    return null;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
