import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Task, TASK_PRIORITIES, RecurrenceConfig, RecurrenceException } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { AuthService } from '../../services/auth.service';
import { DependentService } from '../../services/dependent.service';

@Component({
  selector: 'app-task-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './task-form.component.html',
  styleUrl: './task-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskFormComponent implements OnInit, OnDestroy {
  taskForm!: FormGroup;
  isEditMode = false;
  loading = true;
  submitting = false;
  taskId: string | null = null;
  dependentId: string | null = null;
  userId: string | null = null;
  originalTask: Task | null = null; // Guardar la tarea original para ediciones
  originalDueDate: string | null = null; // Guardar fecha original para detectar cambios
  instanceDate: string | null = null; // Fecha de la instancia específica que se está editando
  showRecurrenceModal = false; // Modal para elegir si cambiar solo esta semana o siempre
  recurrenceChangeType: 'single' | 'all' | null = null; // Tipo de cambio seleccionado

  // Para cambios puntuales en tareas recurrentes
  showInstanceModal = false;
  isInstanceChangeOnly = false;

  priorities = Object.entries(TASK_PRIORITIES).map(([key, value]) => ({
    id: key,
    label: value,
  }));

  caregivers: any[] = [];

  daysOfWeek = [
    { value: 'monday', label: 'Lunes' },
    { value: 'tuesday', label: 'Martes' },
    { value: 'wednesday', label: 'Miércoles' },
    { value: 'thursday', label: 'Jueves' },
    { value: 'friday', label: 'Viernes' },
    { value: 'saturday', label: 'Sábado' },
    { value: 'sunday', label: 'Domingo' },
  ];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly taskService: TaskService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly authService: AuthService,
    private readonly dependentService: DependentService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.initializeForm();
  }

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.userId = currentUser?.uid || null;
    const activeDependentId = this.activeDependentService.getActiveDependentId();

    if (!activeDependentId || !this.userId) {
      this.router.navigate(['/dependent-selector']);
      return;
    }

    this.dependentId = activeDependentId;

    // Cargar cuidadores
    this.loadCaregivers();

    // Revisar si es edición
    this.route.params.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      console.log('Route params:', params);
      // Obtener instanceDate del history.state (si es una instancia de tarea recurrente)
      if (typeof history !== 'undefined' && history.state?.instanceDate) {
        this.instanceDate = history.state.instanceDate;
      }
      console.log('Instance date from router state:', this.instanceDate);

      if (params['id']) {
        this.isEditMode = true;
        this.taskId = params['id'];
        console.log('Edit mode - Loading task with ID:', this.taskId);
        this.loadTask();
      } else {
        console.log('Create mode - Task ID not provided');
        this.loading = false;
        this.cdr.markForCheck();
      }
    });

    // Listener para detectar cambios en la fecha y desactivar recurrencia si es necesario
    this.taskForm
      .get('dueDate')
      ?.valueChanges.pipe(takeUntil(this.destroy$))
      .subscribe((newDate) => {
        this.onDateChange(newDate);
      });
  }

  private onDateChange(newDate: string): void {
    if (!newDate || !this.originalTask || !this.originalTask.recurrence?.daysOfWeek || this.originalTask.recurrence.daysOfWeek.length === 0) {
      return;
    }

    // Si no hay cambio de fecha, no hacer nada
    if (newDate === this.originalDueDate) {
      return;
    }

    // Convertir string date "YYYY-MM-DD" a número de día (0=domingo, 1=lunes, etc)
    const [year, month, day] = newDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();

    // Comprobar si el nuevo día está en los días configurados
    const allowedDays = this.originalTask.recurrence.daysOfWeek;
    const isValidDay = allowedDays.includes(dayOfWeek);

    if (!isValidDay) {
      // El usuario cambió a un día que no coincide con la recurrencia
      // Mostrar modal para preguntarle si es puntual o permanente
      this.showRecurrenceModal = true;
      this.cdr.markForCheck();
    }
  }

  onRecurrenceModalChoice(choice: 'single' | 'all'): void {
    this.recurrenceChangeType = choice;
    this.showRecurrenceModal = false;

    if (choice === 'all') {
      // Desactivar recurrencia (cambio permanente)
      this.taskForm.patchValue({ isRecurring: false });
    }
    // Si es 'single', mantener la recurrencia pero guardar la excepción al submit
    this.cdr.markForCheck();
  }

  private getOriginalDate(): string {
    if (!this.originalDueDate) return '';
    return this.originalDueDate;
  }

  showInstanceChangeDialog(): void {
    const currentDate = this.taskForm.get('dueDate')?.value;
    const originalDate = this.getOriginalDate();

    if (currentDate === originalDate) {
      // Sin cambios de fecha, proceder normalmente
      this.proceedWithSubmit();
      return;
    }

    if (!this.originalTask?.recurrence?.daysOfWeek || this.originalTask.recurrence.daysOfWeek.length === 0) {
      // No es recurrente, proceder normalmente
      this.proceedWithSubmit();
      return;
    }

    // Verificar si el nuevo día coincide con la recurrencia
    const [year, month, day] = currentDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = dateObj.getDay();
    const isValidDay = this.originalTask.recurrence.daysOfWeek.includes(dayOfWeek);

    if (isValidDay) {
      // El día sigue siendo válido para la recurrencia
      this.proceedWithSubmit();
    } else {
      // Día NO válido - preguntar al usuario
      this.showInstanceModal = true;
      this.cdr.markForCheck();
    }
  }

  applyToAllRecurrences(): void {
    this.isInstanceChangeOnly = false;
    this.showInstanceModal = false;
    this.proceedWithSubmit();
  }

  applyToThisInstanceOnly(): void {
    this.isInstanceChangeOnly = true;
    this.showInstanceModal = false;
    this.proceedWithSubmit();
  }

  cancelInstanceChange(): void {
    this.showInstanceModal = false;
    this.cdr.markForCheck();
  }

  private async proceedWithSubmit(): Promise<void> {
    if (!this.taskForm.valid || !this.dependentId || !this.userId) {
      console.error('Form is invalid');
      return;
    }

    this.submitting = true;
    this.cdr.markForCheck();

    try {
      const formValue = this.taskForm.value;

      // Crear fecha respetando la zona horaria local
      const [year, month, day] = formValue.dueDate.split('-').map(Number);
      const [hours, minutes] = (formValue.dueTime || '00:00').split(':').map(Number);
      const dueDate = new Date(year, month - 1, day, hours, minutes, 0, 0);

      // Determinar si es tarea de hoy o futura
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const taskDate = new Date(dueDate);
      taskDate.setHours(0, 0, 0, 0);
      const isTaskToday = taskDate.getTime() === today.getTime();
      const tab = isTaskToday ? 'today' : 'other';

      const recurrence: RecurrenceConfig | undefined = formValue.isRecurring
        ? {
            frequency: formValue.recurrenceFrequency,
            endsAfterDays: formValue.recurrenceEndsAfterDays,
            daysOfWeek: formValue.recurrenceDays?.length > 0 ? formValue.recurrenceDays : undefined,
          }
        : undefined;

      if (this.isEditMode && this.taskId) {
        // En modo edición
        if (this.isInstanceChangeOnly) {
          // Cambio puntual: guardar una excepción
          const formattedNewDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const newException: RecurrenceException = {
            originalDate: this.originalDueDate!,
            newDate: formattedNewDate,
            dueTime: formValue.dueTime,
            reason: 'Cambio puntual por edición del usuario',
          };

          // Agregar la excepción a la tarea original
          const currentExceptions = this.originalTask?.recurrenceExceptions || [];
          const updatedExceptions = currentExceptions.filter(ex => ex.originalDate !== newException.originalDate);
          updatedExceptions.push(newException);

          // Actualizar la tarea original manteniendo la recurrencia pero agregando la excepción
          const updateData: Partial<Task> = {
            recurrenceExceptions: updatedExceptions,
            recurrence: this.originalTask?.recurrence, // Preservar la recurrencia original
          };
          await this.taskService.updateTask(this.taskId, updateData);
          console.log('Task updated with instance exception:', newException);

          // La tarea original se mantiene sin cambios en su fecha y recurrencia
        } else {
          // Cambio en toda la recurrencia: actualizar la tarea original
          const updateData: Partial<Task> = {
            title: formValue.title,
            description: formValue.description,
            dueDate,
            dueTime: formValue.dueTime,
            priority: formValue.priority,
            assignedTo: formValue.assignedTo,
            notes: formValue.notes,
            recurrence,
            recurrenceExceptions: [], // Limpiar excepciones si cambia la recurrencia
            reminder: {
              enabled: formValue.reminder?.enabled || false,
              minutesBefore: formValue.reminder?.minutesBefore || 60
            }
          };
          await this.taskService.updateTask(this.taskId, updateData);
          console.log('Task updated (all recurrences)');
        }
      } else {
        // En modo creación, crear tarea nueva
        const newTask: Task = {
          dependentId: this.dependentId,
          title: formValue.title,
          description: formValue.description,
          dueDate,
          dueTime: formValue.dueTime,
          priority: formValue.priority,
          status: 'pending',
          assignedTo: formValue.assignedTo,
          notes: formValue.notes,
          createdBy: this.userId,
          recurrence,
          reminder: {
            enabled: formValue.reminder?.enabled || false,
            minutesBefore: formValue.reminder?.minutesBefore || 60
          }
        };
        const newTaskId = await this.taskService.createTask(newTask, this.userId);
        console.log('Task created:', newTaskId);
      }

      // Navegar a la pestaña correcta automáticamente
      this.router.navigate(['/tasks'], { queryParams: { tab } });
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      this.submitting = false;
      this.cdr.markForCheck();
    }
  }

  private initializeForm(): void {
    this.taskForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      dueDate: ['', Validators.required],
      dueTime: [''],
      priority: ['medium', Validators.required],
      assignedTo: [[], Validators.required],
      notes: [''],
      isRecurring: [false],
      recurrenceFrequency: ['daily'],
      recurrenceDays: [[]],
      recurrenceEndsAfterDays: [null],
      reminder: this.fb.group({
        enabled: [false],
        minutesBefore: [60]
      })
    });
  }

  private loadCaregivers(): void {
    if (!this.dependentId) return;

    this.dependentService
      .getCaregiversForDependent(this.dependentId)
      .then((caregivers) => {
        this.caregivers = caregivers;
        this.cdr.markForCheck();
      })
      .catch((error) => {
        console.error('Error loading caregivers:', error);
      });
  }

  private loadTask(): void {
    if (!this.taskId) {
      console.warn('No taskId provided');
      return;
    }

    console.log('Loading task with ID:', this.taskId);
    this.taskService
      .getTask(this.taskId)
      .then((task) => {
        console.log('Task loaded:', task);
        if (task) {
          this.populateForm(task);
          console.log('Form populated with task data');
        } else {
          console.warn('Task not found');
        }
        this.loading = false;
        this.cdr.markForCheck();
      })
      .catch((error) => {
        console.error('Error loading task:', error);
        this.loading = false;
        this.cdr.markForCheck();
      });
  }

  private populateForm(task: Task): void {
    console.log('Populating form with task:', task);
    this.originalTask = task; // Guardar la tarea original

    // Si estamos editando una instancia recurrente específica, usar su fecha
    let formattedDate: string;
    if (this.instanceDate) {
      // Usar la fecha de la instancia
      formattedDate = this.instanceDate;
      console.log('Using instance date:', formattedDate);
    } else if (task.dueDate instanceof Date) {
      const d = new Date(task.dueDate);
      // Crear fecha en zona horaria local
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      formattedDate = `${year}-${month}-${day}`;
      console.log('Using task dueDate:', formattedDate);
    } else {
      // Fallback: si no es Date, asumir que ya está en formato YYYY-MM-DD
      formattedDate = '';
    }

    this.originalDueDate = formattedDate; // Guardar fecha original para detectar cambios

    console.log('Formatted date:', formattedDate);
    console.log('Task assignedTo:', task.assignedTo);
    console.log('Task recurrence:', task.recurrence);

    this.taskForm.patchValue({
      title: task.title,
      description: task.description || '',
      dueDate: formattedDate,
      dueTime: task.dueTime || '',
      priority: task.priority,
      assignedTo: task.assignedTo || [],
      notes: task.notes || '',
      isRecurring: !!task.recurrence?.frequency && task.recurrence?.frequency !== 'never',
      recurrenceFrequency: task.recurrence?.frequency || 'daily',
      recurrenceDays: task.recurrence?.daysOfWeek || [],
      recurrenceEndsAfterDays: task.recurrence?.endsAfterDays || null,
      reminder: {
        enabled: task.reminder?.enabled || false,
        minutesBefore: task.reminder?.minutesBefore || 60
      }
    });

    console.log('Form after patchValue:', this.taskForm.value);
  }

  toggleRecurrence(): void {
    if (!this.taskForm.get('isRecurring')?.value) {
      this.taskForm.patchValue({ recurrenceDays: [] });
    }
  }

  onRecurrenceFrequencyChange(): void {
    // Si cambia de frecuencia, limpiar días seleccionados
    if (this.taskForm.get('recurrenceFrequency')?.value !== 'weekly') {
      this.taskForm.patchValue({ recurrenceDays: [] });
    }
  }

  toggleRecurrenceDay(day: string): void {
    const days = this.taskForm.get('recurrenceDays')?.value || [];
    const index = days.indexOf(day);

    if (index > -1) {
      days.splice(index, 1);
    } else {
      days.push(day);
    }

    this.taskForm.patchValue({ recurrenceDays: days });
  }

  isRecurrenceDaySelected(day: string): boolean {
    const days = this.taskForm.get('recurrenceDays')?.value || [];
    return days.includes(day);
  }

  toggleAssignee(caregiverId: string): void {
    const assignedTo = this.taskForm.get('assignedTo')?.value || [];
    const index = assignedTo.findIndex((a: any) => a.userId === caregiverId);

    if (index > -1) {
      assignedTo.splice(index, 1);
    } else {
      // Encontrar el caregiver para obtener su nombre
      const caregiver = this.caregivers.find(c => c.userId === caregiverId);
      if (caregiver) {
        assignedTo.push({ userId: caregiverId, name: caregiver.name });
      } else {
        assignedTo.push({ userId: caregiverId, name: '' });
      }
    }

    this.taskForm.patchValue({ assignedTo });
  }

  isAssigned(caregiverId: string): boolean {
    const assignedTo = this.taskForm.get('assignedTo')?.value || [];
    return assignedTo.some((a: any) => a.userId === caregiverId);
  }

  async onSubmit(): Promise<void> {
    if (!this.taskForm.valid || !this.dependentId || !this.userId) {
      console.error('Form is invalid');
      return;
    }

    // Si es edición de tarea recurrente y cambió la fecha, mostrar modal
    if (this.isEditMode && this.originalTask?.recurrence?.daysOfWeek) {
      this.showInstanceChangeDialog();
    } else {
      this.proceedWithSubmit();
    }
  }

  cancel(): void {
    this.router.navigate(['/tasks']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
