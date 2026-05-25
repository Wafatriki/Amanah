import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import { Router } from '@angular/router';
import { Subject, combineLatest } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CalendarEvent, EVENT_COLORS, EventType } from '../models/calendar-event.model';
import { CalendarEventService } from '../services/calendar-event.service';
import { TaskService } from '../services/task.service';
import { DependentService } from '../services/dependent.service';
import { Task } from '../models/task.model';
import { ActiveDependentService } from '../services/active-dependent.service';
import { AuthService } from '../services/auth.service';
import { PermissionService } from '../services/permission.service';
import { ReminderService } from '../services/reminder.service';
import { AppointmentService } from '../services/appointment.service';
import { Appointment } from '../models/appointment.model';
import { EventDetailsModalComponent } from './event-details-modal/event-details-modal.component';
import { UiFeedbackService } from '../services/ui-feedback.service';
import { NotificationService } from '../services/notification.service';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FullCalendarModule, EventDetailsModalComponent],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarComponent implements OnInit, OnDestroy {
  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, listPlugin],
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,dayGridWeek,dayGridDay,listMonth',
    },
    height: 'auto',
    locale: 'es',
    weekends: true,
    editable: true,
    eventClick: (arg: EventClickArg) => this.handleEventClick(arg),
    dayCellDidMount: (info) => {
      info.el.addEventListener('click', (e) => {
        // Solo navegar a crear si NO es un clic en un evento
        if (!((e.target as HTMLElement).closest('.fc-event'))) {
          this.onDayClick(info.date);
        }
      });
    },
    eventTimeFormat: {
      hour: '2-digit',
      minute: '2-digit',
      meridiem: false,
    },
    eventDisplay: 'block',
  };

  dependentId: string | null = null;
  events: CalendarEvent[] = [];
  tasks: Task[] = [];
  appointments: Appointment[] = [];
  loading = true;
  selectedEventType: EventType | 'all' = 'all';
  showFilters = false;
  private caregivers: { userId: string; name: string }[] = [];

  // Modal state - variables locales simples
  showEventModal = false;
  selectedEvent: CalendarEvent | null = null;
  showTaskModal = false;
  selectedTask: Task | null = null;
  showAppointmentModal = false;
  selectedAppointment: Appointment | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly calendarEventService: CalendarEventService,
    private readonly taskService: TaskService,
    private readonly dependentService: DependentService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly authService: AuthService,
    private readonly permissionService: PermissionService,
    private readonly reminderService: ReminderService,
    private readonly appointmentService: AppointmentService,
    private readonly uiFeedbackService: UiFeedbackService,
    private readonly notificationService: NotificationService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const activeDependentId = this.activeDependentService.getActiveDependentId();

    if (!activeDependentId) {
      console.warn('No active dependent selected');
      this.router.navigate(['/dependent-selector']);
      return;
    }

    this.dependentId = activeDependentId;
    console.log('Calendar initialized for dependent:', activeDependentId);

    // Cargar cuidadores primero, luego cargar eventos
    this.loadCaregivers(activeDependentId).then(() => {
      // Iniciar recordatorios
      if (this.dependentId) {
        this.reminderService.startReminder(this.dependentId);
      }
      this.loadEvents();
    });
  }

  loadEvents(): void {
    if (!this.dependentId) return;

    this.loading = true;
    console.log('Loading calendar events for dependent:', this.dependentId);
    combineLatest([
      this.calendarEventService.getEventsByDependentLive(this.dependentId),
      this.taskService.getTasksByDependentLive(this.dependentId),
      this.appointmentService.getAppointmentsByDependent(this.dependentId),
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ([events, tasks, appointments]: [CalendarEvent[], Task[], Appointment[]]) => {
          console.log('Calendar data loaded:', {
            eventCount: events?.length || 0,
            taskCount: tasks?.length || 0,
            appointmentCount: appointments?.length || 0,
            events,
            tasks,
            appointments
          });
          this.events = events || [];
          // Normalizar tareas al formato nuevo {userId, name}
          this.tasks = (tasks || []).map(task => this.normalizeTask(task));
          this.appointments = appointments || [];
          this.updateCalendarEvents();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading calendar events:', err);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private normalizeTask(task: Task): Task {
    // Si assignedTo es array de strings (formato antiguo), convertir a array de objetos
    if (task.assignedTo && task.assignedTo.length > 0) {
      const first = task.assignedTo[0];
      if (typeof first === 'string') {
        // Formato antiguo: array de strings (IDs)
        task.assignedTo = task.assignedTo.map((id: any) => {
          const caregiver = this.caregivers.find(c => c.userId === id);
          return {
            userId: id,
            name: caregiver?.name || id, // Usar nombre del cuidador, o el ID si no existe
          };
        }) as any;
      }
    }
    return task;
  }

  private loadCaregivers(dependentId: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.dependentService.getCaregiversForDependent(dependentId)
        .then((caregivers) => {
          this.caregivers = caregivers;
          resolve();
        })
        .catch((error) => {
          console.error('Error loading caregivers:', error);
          resolve(); // Resolver incluso con error
        });
    });
  }

  private updateCalendarEvents(): void {
    const baseEvents = this.getFilteredEvents();
    const calendarEvents = baseEvents.map((event) => ({
      id: event.id,
      title: event.title,
      start: new Date(event.startDate),
      end: new Date(event.endDate),
      backgroundColor: EVENT_COLORS[event.type],
      borderColor: EVENT_COLORS[event.type],
      textColor: '#333333',
      extendedProps: {
        type: event.type,
        description: event.description,
      },
    }));

    // Agregar tareas al calendario
    const taskEvents: any[] = [];

    // Mapeo de strings de días a números (0=domingo, 1=lunes, ..., 6=sábado)
    const dayMap: { [key: string]: number } = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6,
    };

    this.tasks.forEach((task) => {
      console.log('Processing task:', task.title, 'DueDate:', task.dueDate, 'Recurrence:', task.recurrence);

      if (!task.dueDate) {
        console.warn('Task without dueDate:', task.title);
        return;
      }

      const startDate = new Date(task.dueDate);

      // Si tiene recurrencia semanal con días específicos, generar múltiples eventos
      const hasDaySelection = task.recurrence?.frequency === 'weekly' &&
                             task.recurrence?.daysOfWeek &&
                             task.recurrence.daysOfWeek.length > 0;

      if (hasDaySelection) {
        console.log('Task with weekly recurrence:', task.title, 'Days (raw):', task.recurrence!.daysOfWeek);

        // Convertir strings de días a números si es necesario
        let daysAsNumbers: number[] = task.recurrence!.daysOfWeek!.map(day => {
          if (typeof day === 'number') {
            return day;
          }
          const numDay = dayMap[day as string];
          console.log(`Converted day "${day}" to ${numDay}`);
          return numDay;
        }).filter(d => d !== undefined);

        console.log('Task with weekly recurrence (numeric days):', task.title, 'Days:', daysAsNumbers);

        // Calcular fecha final
        let endDate = new Date(startDate);
        if (task.recurrence!.endsAfterDays) {
          endDate.setDate(endDate.getDate() + task.recurrence!.endsAfterDays);
        } else if (task.recurrence!.endDate) {
          endDate = new Date(task.recurrence!.endDate);
        } else {
          // Por defecto, 3 meses de recurrencia
          endDate.setMonth(endDate.getMonth() + 3);
        }

        // Generar eventos para cada occurrencia
        const currentDate = new Date(startDate);
        let eventCount = 0;
        while (currentDate <= endDate) {
          const dayOfWeek = currentDate.getDay();
          if (daysAsNumbers.includes(dayOfWeek)) {
            const newEvent = {
              id: `task-${task.id}-${currentDate.getTime()}`,
              title: task.title,
              start: new Date(currentDate),
              end: new Date(currentDate),
              backgroundColor: this.getTaskColor(),
              borderColor: this.getTaskColor(),
              textColor: '#333333',
              extendedProps: {
                type: 'task',
                taskId: task.id,
                description: task.description,
                priority: task.priority,
              },
            };
            taskEvents.push(newEvent);
            eventCount++;
            console.log(`Created recurring task event #${eventCount}:`, newEvent.title, 'Date:', newEvent.start);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
        console.log(`Total recurring events created for "${task.title}": ${eventCount}`);
      } else {
        // Tarea sin recurrencia específica, mostrar en la fecha de vencimiento
        const newEvent = {
          id: `task-${task.id}`,
          title: task.title,
          start: startDate,
          end: startDate,
          backgroundColor: this.getTaskColor(),
          borderColor: this.getTaskColor(),
          textColor: '#333333',
          extendedProps: {
            type: 'task',
            taskId: task.id,
            description: task.description,
            priority: task.priority,
          },
        };
        taskEvents.push(newEvent);
        console.log('Created single task event:', newEvent.title, 'Date:', newEvent.start);
      }
    });

    // Agregar citas al calendario
    const appointmentEvents = this.appointments.filter(a => a && a.id).map((appointment) => {
      try {
        // Asegurar que la fecha sea un Date objeto
        let appointmentDate: Date;
        if (appointment.date instanceof Date) {
          appointmentDate = new Date(appointment.date);
        } else if (typeof appointment.date === 'string') {
          appointmentDate = new Date(appointment.date);
        } else if (typeof appointment.date === 'number') {
          appointmentDate = new Date(appointment.date);
        } else if (appointment.date && typeof appointment.date === 'object' && 'toDate' in appointment.date) {
          // Firestore Timestamp
          appointmentDate = (appointment.date as any).toDate();
        } else {
          appointmentDate = new Date();
          console.warn('Could not parse appointment date:', appointment.date);
        }

        // Crear la fecha y hora de inicio
        const startDate = new Date(appointmentDate);
        if (appointment.time) {
          try {
            const [hours, minutes] = appointment.time.split(':');
            startDate.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
          } catch (e) {
            console.warn('Could not parse appointment time:', appointment.time, e);
          }
        }

        console.log(`Appointment: ${appointment.specialty} - Date: ${appointmentDate.toISOString()}, Time: ${appointment.time}, Start: ${startDate.toISOString()}`);

        return {
          id: `appointment-${appointment.id}`,
          title: `${appointment.specialty}${appointment.doctor ? ' - ' + appointment.doctor : ''}`,
          start: startDate,
          end: startDate,
          backgroundColor: this.getAppointmentColor(),
          borderColor: this.getAppointmentColor(),
          textColor: '#333333',
          extendedProps: {
            type: 'appointment',
            description: appointment.reason || appointment.notes,
            status: appointment.status,
          },
        };
      } catch (error) {
        console.error('Error processing appointment:', appointment, error);
        // Fallback: crear evento con fecha de hoy
        return {
          id: `appointment-${appointment.id}`,
          title: `${appointment.specialty}${appointment.doctor ? ' - ' + appointment.doctor : ''}`,
          start: new Date(),
          end: new Date(),
          backgroundColor: this.getAppointmentColor(),
          borderColor: this.getAppointmentColor(),
          textColor: '#333333',
          extendedProps: {
            type: 'appointment',
            description: appointment.reason || appointment.notes,
            status: appointment.status,
          },
        };
      }
    });

    // Aplicar filtro por tipo de evento
    let filteredEvents: any[] = [];
    if (this.selectedEventType === 'all') {
      filteredEvents = [...calendarEvents, ...taskEvents, ...appointmentEvents];
    } else if (this.selectedEventType === 'task') {
      filteredEvents = [...taskEvents];
    } else if (this.selectedEventType === 'appointment') {
      filteredEvents = [...appointmentEvents];
    } else if (this.selectedEventType === 'other') {
      filteredEvents = [...calendarEvents];
    }

    console.log('Calendar events summary:', {
      events: calendarEvents.length,
      tasks: taskEvents.length,
      appointments: appointmentEvents.length,
      total: filteredEvents.length,
      filter: this.selectedEventType,
      taskEventsList: taskEvents.slice(0, 5) // Mostrar primeros 5 eventos de tareas
    });

    this.calendarOptions = {
      ...this.calendarOptions,
      events: filteredEvents,
    };

    this.cdr.markForCheck();
  }

  private getFilteredEvents(): CalendarEvent[] {
    // Excluir siempre eventos de medicación
    const nonMedicationEvents = this.events.filter((event) => event.type !== 'medication');

    if (this.selectedEventType === 'all') {
      return nonMedicationEvents;
    }
    return nonMedicationEvents.filter((event) => event.type === this.selectedEventType);
  }

  private getTaskColor(): string {
    return '#B8A5D6'; // Color fijo púrpura para todas las tareas
  }

  private getAppointmentColor(): string {
    return '#ADD8E6'; // Color fijo azul pastel para todas las citas
  }

  handleEventClick(arg: EventClickArg): void {
    const eventId = arg.event.id;
    const extendedProps = arg.event.extendedProps;
    console.log('Event clicked:', eventId, extendedProps);

    // Detectar si es una tarea, cita o un evento
    if (eventId?.startsWith('task-')) {
      // Extraer el taskId real (puede estar en el extendedProps para eventos recurrentes)
      const taskId = extendedProps?.['taskId'] || eventId.replace('task-', '').split('-')[0];
      this.openTaskDetails(taskId);
    } else if (eventId?.startsWith('appointment-')) {
      const appointmentId = eventId.replace('appointment-', '');
      this.openAppointmentDetails(appointmentId);
    } else if (eventId) {
      this.openEventDetails(eventId);
    }
  }

  private openTaskDetails(taskId: string): void {
    // Primero buscar por ID exacto
    let task = this.tasks.find(t => t.id === taskId);

    // Si no encontramos, buscar por parentTaskId (para tareas recurrentes expandidas)
    if (!task) {
      task = this.tasks.find(t => t.parentTaskId === taskId);
      console.log('Task found by parentTaskId:', task?.title);
    } else {
      console.log('Task found by id:', task.title);
    }

    if (task) {
      this.selectedTask = task;
      this.showTaskModal = true;
      this.cdr.markForCheck();
    } else {
      console.warn('Task not found with taskId:', taskId);
    }
  }

  private openEventDetails(eventId: string): void {
    console.log('Opening event details for:', eventId);
    this.calendarEventService
      .getEvent(eventId, this.dependentId!)
      .then((event) => {
        if (event) {
          console.log('Event loaded, showing modal:', event.title);
          this.selectedEvent = event;
          this.showEventModal = true;
          this.cdr.markForCheck();
        }
      })
      .catch((error) => {
        console.error('Error loading event:', error);
      });
  }

  private openAppointmentDetails(appointmentId: string): void {
    const appointment = this.appointments.find(a => a.id === appointmentId);
    if (appointment) {
      this.selectedAppointment = appointment;
      this.showAppointmentModal = true;
      this.cdr.markForCheck();
    }
  }

  closeModal(): void {
    console.log('Closing modal');
    this.showEventModal = false;
    this.selectedEvent = null;
    this.showTaskModal = false;
    this.selectedTask = null;
    this.showAppointmentModal = false;
    this.selectedAppointment = null;
    this.cdr.markForCheck();
  }

  editEvent(eventId: string): void {
    console.log('Editing event:', eventId);
    this.closeModal();
    this.router.navigate(['/calendar/edit', eventId]);
  }

  async deleteEvent(eventId: string): Promise<void> {
    console.log('Deleting event:', eventId);
    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar evento',
      message: 'El evento se eliminará de forma permanente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (confirmed) {
      if (!this.dependentId) {
        console.error('No dependent selected');
        return;
      }
      this.calendarEventService
        .deleteEvent(eventId, this.dependentId)
        .then(() => {
          console.log('Event deleted');
          this.notificationService.notifySuccess('Evento eliminado', 'El evento se eliminó correctamente');
          this.closeModal();
        })
        .catch((error) => {
          console.error('Error deleting event:', error);
          this.notificationService.notifyError('Error', 'No se pudo eliminar el evento');
        });
    }
  }

  markTaskComplete(taskId: string): void {
    if (this.selectedTask) {
      this.taskService
        .updateTask(taskId, { status: 'completed' })
        .then(() => {
          this.selectedTask!.status = 'completed';
          this.cdr.markForCheck();
        })
        .catch((error) => {
          console.error('Error completing task:', error);
        });
    }
  }

  async deleteTask(taskId: string): Promise<void> {
    console.log('Deleting task:', taskId);
    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar tarea',
      message: 'La tarea se eliminará de forma permanente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (confirmed) {
      this.taskService
        .deleteTask(taskId)
        .then(() => {
          console.log('Task deleted');
          this.notificationService.notifySuccess('Tarea eliminada', 'La tarea se eliminó correctamente');
          this.closeModal();
        })
        .catch((error) => {
          console.error('Error deleting task:', error);
          this.notificationService.notifyError('Error', 'No se pudo eliminar la tarea');
        });
    }
  }

  editTask(taskId: string): void {
    // Usar el parentTaskId si es una instancia recurrente, si no usar el taskId
    const originalTaskId = this.selectedTask?.parentTaskId || taskId;
    console.log('Editing task - Original ID:', originalTaskId, 'Instance ID:', taskId);
    this.router.navigate(['/tasks/edit', originalTaskId]);
    this.closeModal();
  }

  editTaskDirect(): void {
    // Método para editar llamado directamente desde el modal
    if (!this.selectedTask?.id) {
      console.error('No task selected');
      return;
    }

    // Si es una tarea expandida (tiene parentTaskId), editar la tarea original
    const taskIdToEdit = this.selectedTask.parentTaskId || this.selectedTask.id;
    console.log('Editing task directly - TaskID:', taskIdToEdit, 'Parent/Original:', this.selectedTask.parentTaskId);
    this.router.navigate(['/tasks/edit', taskIdToEdit]);
    this.closeModal();
  }

  onDayClick(date: Date): void {
    // Solo permitir crear evento si no es invitado (read-only)
    if (this.permissionService.isReadOnly()) {
      return;
    }
    // Navigate to create event for this day
    const dateStr = date.toISOString().split('T')[0];
    this.router.navigate(['/calendar/create'], {
      queryParams: { date: dateStr },
    });
  }

  filterByType(type: EventType | 'all'): void {
    this.selectedEventType = type;
    this.updateCalendarEvents();
  }

  createNewEvent(): void {
    this.router.navigate(['/calendar/create']);
  }

  canCreateEvent(): boolean {
    return !this.permissionService.isReadOnly();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  ngOnDestroy(): void {
    // Detener recordatorios al salir
    if (this.dependentId) {
      this.reminderService.stopReminder(this.dependentId);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }
}
