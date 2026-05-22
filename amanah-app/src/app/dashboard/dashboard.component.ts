import { Component, OnInit, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { DependentService } from '../services/dependent.service';
import { ActiveDependentService } from '../services/active-dependent.service';
import { CalendarEventService } from '../services/calendar-event.service';
import { TaskService } from '../services/task.service';
import { MedicationService } from '../services/medication.service';
import { AppointmentService } from '../services/appointment.service';
import { ChatService } from '../services/chat.service';
import { SidebarService } from '../services/sidebar.service';
import { NotificationService } from '../services/notification.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { User } from 'firebase/auth';
import { CalendarEvent } from '../models/calendar-event.model';
import { Task } from '../models/task.model';
import { Medication } from '../models/medication.model';
import { Appointment } from '../models/appointment.model';
import { ChatMessage } from '../models/chat.model';

interface DashboardMedication {
  name: string;
  dose: string;
  time: string;
  status: 'pending' | 'completed';
  color: 'purple' | 'blue' | 'green' | 'orange';
}

interface DashboardAppointment {
  title: string;
  doctor: string;
  location: string;
  date: string;
  time: string;
  color: 'orange' | 'blue';
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, OnDestroy {
  user: User | null = null;
  activeDependentId: string | null = null;
  activeDependentName: string = 'Paciente';
  userName: string = 'Ana';
  currentDate: string = '';
  hasDependents = false;
  loading = true;

  // Real-time data from services
  upcomingEvents: CalendarEvent[] = [];
  allUrgentTasks: Task[] = [];
  todaysTasks: Task[] = [];
  allTasks: Task[] = [];
  todaysMedications: Medication[] = [];
  allAppointments: Appointment[] = []; // Todas las citas próximas
  upcomingAppointments: Appointment[] = []; // Solo la próxima cita para mostrar
  hasTodayAppointments: boolean = false; // Para cambiar título dinámicamente
  unreadMessages: ChatMessage[] = [];

  // Mock data as fallback
  mockMedications: DashboardMedication[] = [
    { name: 'Vitamina D3', dose: '4000 IU • 1 cápsula', time: '8:00 AM', status: 'pending', color: 'purple' },
    { name: 'Enalapril', dose: '10 mg • 1 comprimido', time: '8:00 AM', status: 'pending', color: 'blue' },
    { name: 'Omeprazol', dose: '20 mg • 1 cápsula', time: '8:00 AM', status: 'pending', color: 'green' }
  ];

  mockAppointments: DashboardAppointment[] = [
    { title: 'Control cardiología', doctor: 'Dr. García', location: 'Hospital Central', date: '28 Feb', time: '10:30 AM', color: 'orange' },
    { title: 'Fisioterapia', doctor: 'Laura Martínez', location: 'Centro Norte', date: '2 Mar', time: '16:00 PM', color: 'blue' }
  ];

  // Calendar properties
  activeCalendarDay: number | null = null;
  currentMonth: number = new Date().getMonth();
  currentYear: number = new Date().getFullYear();
  today: Date = new Date();

  // Track tasks being updated to prevent race conditions
  private updatingTaskIds = new Set<string>();

  // Store calendar events separately for combining with tasks/appointments
  private currentCalendarEvents: CalendarEvent[] = [];
  private allMessages: ChatMessage[] = [];

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly authService: AuthService,
    private readonly dependentService: DependentService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly calendarEventService: CalendarEventService,
    private readonly taskService: TaskService,
    private readonly medicationService: MedicationService,
    private readonly appointmentService: AppointmentService,
    private readonly chatService: ChatService,
    private readonly sidebarService: SidebarService,
    private readonly notificationService: NotificationService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log(`[DASHBOARD-INIT] Dashboard component initialized`);
    this.setCurrentDate();

    this.authService.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(user => {
      console.log(`[DASHBOARD-INIT] currentUser$ emitted, user:`, user?.uid || 'null');
      this.user = user;
      if (user) {
        console.log(`[DASHBOARD-INIT] User found, calling loadDependents(${user.uid})`);
        this.loadDependents(user.uid);
      } else {
        console.log(`[DASHBOARD-INIT] No user, redirecting to login`);
        this.router.navigate(['/login']);
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDependents(userId: string): void {
    console.log(`[DASHBOARD] loadDependents called with userId: ${userId}`);

    // Verificar si ya hay un dependiente activo guardado
    const activeDependentId = this.activeDependentService.getActiveDependentId();
    console.log(`[DASHBOARD] activeDependentId from service: ${activeDependentId}`);

    if (activeDependentId?.trim()) {
      console.log(`[DASHBOARD] Active dependent found: ${activeDependentId}, validating...`);

      // Validar que el dependiente pertenece al usuario actual
      this.dependentService.getDependentsForUser(userId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (dependents) => {
            const belongsToUser = dependents.some(d => d.id === activeDependentId);

            if (belongsToUser) {
              // El dependiente pertenece al usuario, cargar
              this.activeDependentId = activeDependentId;
              this.dependentService.getDependent(activeDependentId)
                .pipe(takeUntil(this.destroy$))
                .subscribe({
                  next: (dependent) => {
                    if (dependent) {
                      this.activeDependentName = dependent.name;
                      this.hasDependents = true;
                      this.sidebarService.setSidebarVisible(true);

                      // Obtener el rol del usuario para este dependiente
                      this.dependentService.getCaregiversForDependent(activeDependentId)
                        .then(caregivers => {
                          const userCaregiver = caregivers.find(c => c.userId === userId);
                          if (userCaregiver) {
                            this.activeDependentService.setActiveDependentRole(
                              userCaregiver.role as 'primary_caregiver' | 'collaborative_caregiver' | 'invited'
                            );
                            console.log('User role for active dependent:', userCaregiver.role);
                          }
                        });

                      this.loading = false;
                      this.loadLiveData(activeDependentId);
                      this.cdr.detectChanges();
                    }
                  },
                  error: (err) => {
                    console.error('Error loading active dependent:', err);
                    this.activeDependentService.clearActiveDependentId();
                    this.loadDependentsForSelection(userId);
                  }
                });
            } else {
              // El dependiente NO pertenece al usuario, limpiar y mostrar selector
              console.warn('Active dependent does not belong to current user, clearing');
              this.activeDependentService.clearActiveDependentId();
              this.loadDependentsForSelection(userId);
            }
          },
          error: (err) => {
            console.error('Error validating dependent ownership:', err);
            this.activeDependentService.clearActiveDependentId();
            this.loadDependentsForSelection(userId);
          }
        });
      return;
    }

    this.loadDependentsForSelection(userId);
  }

  private loadDependentsForSelection(userId: string): void {
    this.dependentService.getDependentsForUser(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
      next: (dependents) => {
        console.log('loadDependents next:', dependents);
        this.loading = false;
        this.cdr.detectChanges();

        // Si no hay dependientes, mostrar pantalla de crear
        if (dependents.length === 0) {
          console.log('No dependents - show create screen');
          this.hasDependents = false;
          this.sidebarService.setSidebarVisible(false);
          this.cdr.detectChanges();
          return;
        }

        // Si hay 1, cargarlo automáticamente
        if (dependents.length === 1) {
          const dependent = dependents[0];
          console.log('1 dependent found, loading:', dependent);
          this.activeDependentService.setActiveDependentId(dependent.id);

          // Obtener el rol del usuario para este dependiente
          this.dependentService.getCaregiversForDependent(dependent.id)
            .then(caregivers => {
              const userCaregiver = caregivers.find(c => c.userId === userId);
              if (userCaregiver) {
                this.activeDependentService.setActiveDependentRole(
                  userCaregiver.role as 'primary_caregiver' | 'collaborative_caregiver' | 'invited'
                );
                console.log('User role for single dependent:', userCaregiver.role);
              }
            });

          this.activeDependentId = dependent.id;
          this.activeDependentName = dependent.name;
          this.hasDependents = true;
          this.sidebarService.setSidebarVisible(true);
          this.loadLiveData(dependent.id);
          this.cdr.detectChanges();
          return;
        }

        // Si hay 2+, ir al selector
        if (dependents.length > 1) {
          console.log('Multiple dependents found, navigating to selector');
          this.router.navigate(['/dependent-selector']);
        }
      },
      error: (err) => {
        console.error('loadDependents error:', err);
        this.loading = false;
        this.hasDependents = false;
        this.sidebarService.setSidebarVisible(false);
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Carga datos en tiempo real del calendario y tareas
   */
  private caregivers: { userId: string; name: string }[] = [];

  private loadLiveData(dependentId: string): void {
    console.log(`[DASHBOARD] loadLiveData() called for dependentId: ${dependentId}`);
    // Cargar cuidadores primero, luego cargar datos en tiempo real
    this.loadCaregivers(dependentId).then(() => {
      console.log(`[DASHBOARD] loadCaregivers completed, now loading other data...`);
      this.loadUpcomingEvents(dependentId);
      this.loadTasksSummary(dependentId);
      this.loadTodaysMedications(dependentId);
      this.loadUpcomingAppointments(dependentId);
      this.loadUnreadMessages(dependentId);
    });
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

  /**
   * Carga eventos próximos (próximos 7 días)
   */
  private loadUpcomingEvents(dependentId: string): void {
    // Cargar solo eventos de calendario
    this.calendarEventService.getEventsByDependentLive(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (calendarEvents) => {
          // Guardar eventos de calendario
          this.currentCalendarEvents = calendarEvents;
          // Actualizar calendario con eventos + citas + tareas
          this.updateCalendarDisplay();
        },
        error: (err) => console.error('Error loading calendar events:', err)
      });
  }

  private updateCalendarDisplay(): void {
    if (!this.activeDependentId) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Eventos próximos comienzan desde mañana
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const thirtyDaysLater = new Date(tomorrow);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    // Include appointments (starting from tomorrow, next 30 days)
    const appointmentEvents = this.allAppointments
      .filter(apt => {
        const aptDate = new Date(apt.date);
        aptDate.setHours(0, 0, 0, 0);
        return aptDate >= tomorrow && aptDate <= thirtyDaysLater;
      })
      .map(apt => ({
        id: apt.id,
        dependentId: this.activeDependentId!,
        title: apt.specialty + (apt.doctor ? ` - ${apt.doctor}` : ''),
        description: apt.location || '',
        startDate: new Date(apt.date),
        endDate: new Date(apt.date),
        type: 'appointment' as const,
        createdBy: this.user?.uid || '',
      }));

    // Include pending tasks (starting from tomorrow, next 30 days)
    const taskEvents = this.allTasks
      .filter(task => {
        if (task.status !== 'pending') return false;
        const taskDate = new Date(task.dueDate);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate >= tomorrow && taskDate <= thirtyDaysLater;
      })
      .map(task => ({
        id: task.id,
        dependentId: this.activeDependentId!,
        title: task.title,
        description: task.description || '',
        startDate: task.dueDate ? new Date(task.dueDate) : new Date(),
        endDate: task.dueDate ? new Date(task.dueDate) : new Date(),
        type: 'task' as const,
        createdBy: this.user?.uid || '',
      }));

    // Include calendar events (starting from tomorrow, next 30 days)
    const calendarEvents = this.currentCalendarEvents.filter(event => {
      const eventDate = new Date(event.startDate);
      eventDate.setHours(0, 0, 0, 0);
      return eventDate >= tomorrow && eventDate <= thirtyDaysLater;
    });

    // Combine and sort by date
    this.upcomingEvents = [...calendarEvents, ...appointmentEvents, ...taskEvents]
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

    this.cdr.detectChanges();
  }

  /**
   * Carga tareas urgentes separadas por asignación
   */
  private loadTasksSummary(dependentId: string): void {
    this.taskService.getTasksByDependentLive(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tasks) => {
          // Normalizar tareas al formato nuevo {userId, name}
          const normalizedTasks = tasks.map(task => this.normalizeTask(task));
          const expandedTasks = this.expandRecurringTasks(normalizedTasks);
          const currentUserId = this.authService.getCurrentUser()?.uid;

          // Obtener fecha de hoy en formato YYYY-MM-DD para evitar problemas de zona horaria
          const today = new Date();
          const todayString = this.getDateString(today);

          console.log('DEBUG - TODAY:', todayString);
          console.log('DEBUG - ALL TASKS:', expandedTasks.map(t => ({
            title: t.title,
            dueDate: t.dueDate,
            dueDateString: this.getDateString(new Date(t.dueDate)),
            status: t.status
          })));

          // Todas las tareas
          this.allTasks = expandedTasks;

          // Tareas de hoy (solo asignadas al usuario actual)
          this.todaysTasks = expandedTasks.filter(task => {
            if (!this.isTaskAssignedToUser(task, currentUserId)) return false;
            const taskDateString = this.getDateString(new Date(task.dueDate));
            const match = taskDateString === todayString && task.status === 'pending';
            if (match) {
              console.log(`TODAYS TASK: ${task.title}`);
            }
            return match;
          });

          console.log('TODAYS TASKS COUNT:', this.todaysTasks.length);

          // Tareas urgentes: solo de hoy y pending
          this.allUrgentTasks = expandedTasks.filter(task => {
            if (!this.isTaskAssignedToUser(task, currentUserId)) return false;
            if (task.status !== 'pending') return false;

            const taskDateString = this.getDateString(new Date(task.dueDate));
            return taskDateString === todayString;
          }).sort((a, b) => {
            const dateA = new Date(a.dueDate).getTime();
            const dateB = new Date(b.dueDate).getTime();
            if (dateA !== dateB) return dateA - dateB;

            const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
            return (priorityOrder[a.priority as any] ?? 2) - (priorityOrder[b.priority as any] ?? 2);
          }).slice(0, 5);

          // Reprogramar recordatorios de tareas
          if (this.user) {
            this.notificationService.rescheduleTaskReminders(expandedTasks, this.user.uid);
          }

          this.updateCalendarDisplay();
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error loading tasks:', err)
      });
  }

  /**
   * Convierte una fecha a string en formato YYYY-MM-DD
   */
  private getDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isTaskAssignedToUser(task: any, userId: string | undefined): boolean {
    if (!userId) return true;
    return !!task.assignedTo?.some((a: any) => a.userId === userId);
  }

  private expandRecurringTasks(tasks: Task[]): Task[] {
    const expandedTasks: Task[] = [];
    const dayMap: { [key: string]: number } = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };

    tasks.forEach(task => {
      if (
        task.recurrence?.frequency === 'weekly' &&
        task.recurrence?.daysOfWeek &&
        task.recurrence.daysOfWeek.length > 0
      ) {
        const startDate = new Date(task.dueDate);

        const daysAsNumbers: number[] = task.recurrence.daysOfWeek
          .map(day => {
            if (typeof day === 'number') return day;
            return dayMap[day as unknown as string];
          })
          .filter((day): day is number => day !== undefined);

        let endDate = new Date(startDate);
        if (task.recurrence.endsAfterDays) {
          endDate.setDate(endDate.getDate() + task.recurrence.endsAfterDays);
        } else if (task.recurrence.endDate) {
          endDate = new Date(task.recurrence.endDate);
        } else {
          endDate.setMonth(endDate.getMonth() + 3);
        }

        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dayOfWeek = currentDate.getDay();
          if (daysAsNumbers.includes(dayOfWeek)) {
            const dateStr = this.getLocalDateString(currentDate);

            let instanceDate = new Date(currentDate);
            let displayDate = dateStr;

            if (task.recurrenceExceptions) {
              const exception = task.recurrenceExceptions.find(ex => ex.originalDate === dateStr);
              if (exception) {
                const [year, month, day] = exception.newDate.split('-').map(Number);
                instanceDate = new Date(year, month - 1, day);
                displayDate = exception.newDate;
              }
            }

            const isCompleted = task.completedInstances?.includes(displayDate) || false;

            expandedTasks.push({
              ...task,
              id: `${task.id}-${currentDate.getTime()}`,
              dueDate: instanceDate,
              parentTaskId: task.id,
              status: isCompleted ? 'completed' : task.status,
              instanceDate: displayDate,
            });
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        expandedTasks.push(task);
      }
    });

    return expandedTasks;
  }

  private normalizeTask(task: any): any {
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
        });
      }
    }
    return task;
  }

  /**
   * Carga medicaciones de hoy
   */
  private loadTodaysMedications(dependentId: string): void {
    console.log(`[DASHBOARD] loadTodaysMedications called for dependentId: ${dependentId}`);
    this.medicationService.getMedicationsByDependent(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (medications) => {
          console.log(`[DASHBOARD] Recibidas ${medications?.length || 0} medicaciones`);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Filtrar medicaciones activas que tengan al menos un horario PENDIENTE hoy
          this.todaysMedications = medications.filter(med => {
            // Solo medicaciones activas
            if (!med.isActive) {
              return false;
            }

            const startDate = new Date(med.startDate);
            startDate.setHours(0, 0, 0, 0);

            // Si tiene fecha de fin, verificar que no haya pasado
            if (med.endDate) {
              const endDate = new Date(med.endDate);
              endDate.setHours(0, 0, 0, 0);
              if (!(startDate <= today && endDate >= today)) {
                return false;
              }
            } else {
              // Si no tiene fecha de fin, solo verificar que haya empezado
              if (!(startDate <= today)) {
                return false;
              }
            }

            // Verificar que tenga al menos un horario pendiente (no completado)
            return med.schedules && med.schedules.some(schedule => !schedule.completed);
          }).slice(0, 3); // Mostrar máximo 3

          // Reprogramar recordatorios de medicaciones
          console.log(`[DASHBOARD] this.user = ${this.user?.uid}, medications para reprogramar = ${medications.length}`);
          if (this.user) {
            console.log(`[DASHBOARD] ✅ Reprogramando recordatorios para ${medications.length} medicaciones`);
            this.notificationService.rescheduleMedicationReminders(medications, this.user.uid);
          } else {
            console.warn(`[DASHBOARD] ❌ No se pueden reprogramar recordatorios: this.user es null`);
          }

          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error loading medications:', err)
      });
  }

  /**
   * Carga citas de hoy
   */
  private loadUpcomingAppointments(dependentId: string): void {
    this.appointmentService.getAppointmentsByDependent(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (appointments) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          // Filtrar solo citas de hoy
          const todaysAppointments = appointments
            .filter(apt => {
              const aptDate = new Date(apt.date);
              aptDate.setHours(0, 0, 0, 0);
              return aptDate.getTime() === today.getTime();
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          // Para el calendario, guardar todas las citas (próximas 30 días)
          const thirtyDaysLater = new Date(today);
          thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

          this.allAppointments = appointments
            .filter(apt => {
              const aptDate = new Date(apt.date);
              aptDate.setHours(0, 0, 0, 0);
              return aptDate >= today && aptDate <= thirtyDaysLater;
            })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          // Mostrar solo citas de HOY
          this.upcomingAppointments = todaysAppointments;

          // Determinar si hay citas de hoy para el título dinámico
          this.hasTodayAppointments = todaysAppointments.length > 0;

          // Reprogramar recordatorios de citas
          if (this.user) {
            this.notificationService.rescheduleAppointmentReminders(this.allAppointments, this.user.uid);
          }

          this.updateCalendarDisplay();
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error loading appointments:', err)
      });
  }

  private loadUnreadMessages(dependentId: string): void {
    this.chatService.getMessages(dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (messages) => {
          // Filtrar mensajes de hoy que NO sean del usuario actual Y no hayan sido leídos
          const currentUserId = this.user?.uid;
          this.allMessages = messages;
          this.unreadMessages = messages.filter(msg => {
            // No contar mensajes del usuario actual, solo de otros
            // Y solo si no han sido leídos
            return !msg.isRead && msg.userId !== currentUserId;
          });

          this.updateCalendarDisplay();
          this.cdr.detectChanges();
        },
        error: (err) => console.error('Error loading messages:', err)
      });
  }

  createNewDependent(): void {
    console.log('Navigating to create dependent page');
    this.router.navigate(['/create-dependent']);
  }

  setCurrentDate(): void {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date();
    const parts = today.toLocaleDateString('es-ES', options).split(', ');
    this.currentDate = parts.join(', ');
  }

  onLogout(): void {
    this.authService.logout().then(() => {
      this.router.navigate(['/login']);
    });
  }

  /**
   * Calendar Methods
   */
  getEmptyDays(): number[] {
    const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
    // Adjust because getDay() returns 0 for Sunday, but we want Monday=0
    const adjustedFirstDay = (firstDay === 0) ? 6 : firstDay - 1;
    return Array(adjustedFirstDay).fill(0);
  }

  getMonthDays(): number[] {
    const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, i) => i + 1);
  }

  getCalendarMonthYear(): string {
    const date = new Date(this.currentYear, this.currentMonth);
    const options: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' };
    return date.toLocaleDateString('es-ES', options);
  }

  previousMonth(): void {
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
  }

  nextMonth(): void {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
  }

  isToday(day: number): boolean {
    const today = new Date();
    return (
      day === today.getDate() &&
      this.currentMonth === today.getMonth() &&
      this.currentYear === today.getFullYear()
    );
  }

  isEventDay(day: number): boolean {
    return this.upcomingEvents.some(event => {
      const eventDate = new Date(event.startDate);
      return (
        day === eventDate.getDate() &&
        this.currentMonth === eventDate.getMonth() &&
        this.currentYear === eventDate.getFullYear()
      );
    });
  }

  selectCalendarDay(day: number): void {
    this.activeCalendarDay = day;
  }

  // Navigate to calendar
  goToCalendar(): void {
    this.router.navigate(['/calendar']);
  }

  // Navigate to tasks
  goToTasks(): void {
    this.router.navigate(['/tasks']);
  }

  // Navigate to my tasks (caregiver view)
  goToMyTasks(): void {
    this.router.navigate(['/tasks/my-tasks']);
  }

  // Navigate to medications
  goToMedications(): void {
    this.router.navigate(['/medications']);
  }

  // Navigate to appointments
  goToAppointments(): void {
    this.router.navigate(['/appointments']);
  }

  // Navigate to chat
  goToChat(): void {
    // Marcar todos los mensajes no leídos como leídos antes de navegar
    if (this.activeDependentId && this.unreadMessages.length > 0) {
      const unreadMessageIds = this.unreadMessages
        .map(msg => msg.id)
        .filter((id): id is string => id !== undefined);

      if (unreadMessageIds.length > 0) {
        this.chatService.markMessagesAsRead(this.activeDependentId, unreadMessageIds).catch(err =>
          console.error('Error marking messages as read:', err)
        );
      }
    }

    this.router.navigate(['/chat']);
  }

  async completeTask(taskId: string | undefined): Promise<void> {
    if (!taskId || !this.user) return;

    // Prevent multiple rapid clicks on same task
    if (this.updatingTaskIds.has(taskId)) return;

    const task = this.todaysTasks.find(t => t.id === taskId) || this.allUrgentTasks.find(t => t.id === taskId);
    if (!task) return;

    // Mark as updating
    this.updatingTaskIds.add(taskId);

    try {
      // Update state locally IMMEDIATELY for instant UI feedback
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      task.status = newStatus;
      this.cdr.markForCheck();

      // Update in Firestore in the background
      await this.taskService.setTaskStatus(taskId, newStatus, this.user.uid, undefined, this.activeDependentId || undefined);
      console.log('Task status updated to:', newStatus);
    } catch (error) {
      console.error('Error updating task status:', error);
      // On error, revert the local change
      const task = this.todaysTasks.find(t => t.id === taskId) || this.allUrgentTasks.find(t => t.id === taskId);
      if (task) {
        task.status = task.status === 'completed' ? 'pending' : 'completed';
        this.cdr.markForCheck();
      }
    } finally {
      // Remove from updating set
      this.updatingTaskIds.delete(taskId);
    }
  }

  getStats() {
    const currentUserId = this.authService.getCurrentUser()?.uid;

    // Get today's date at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filter tasks for today only
    const myTasks = this.allTasks.filter(task => {
      if (task.status !== 'pending' || !currentUserId) return false;
      if (!task.assignedTo?.some((a: any) => a.userId === currentUserId)) return false;

      // Check if task is due today
      const dueDate = task.dueDate instanceof Date ? task.dueDate : new Date(task.dueDate);
      dueDate.setHours(0, 0, 0, 0);

      return dueDate.getTime() === today.getTime();
    });

    return {
      medications: this.todaysMedications.length,
      appointments: this.upcomingAppointments.length,
      pendingTasks: myTasks.length,
      messages: this.unreadMessages.length
    };
  }

  // Helper methods for template
  getEventColor(eventType: string): string {
    const colors: Record<string, string> = {
      'task': '#B8A5D6',
      'appointment': '#1565c0',
      'medication': '#f44336',
      'other': '#9B88B8'
    };
    return colors[eventType] || '#B8A5D6';
  }

  getEventLabel(eventType: string): string {
    const labels: Record<string, string> = {
      'task': 'Tarea',
      'appointment': 'Cita',
      'medication': 'Medicación',
      'other': 'Evento'
    };
    return labels[eventType] || eventType;
  }

  getTaskPriorityColor(priority: string): string {
    const colors: Record<string, string> = {
      'high': '#f44336',
      'medium': '#ff9800',
      'low': '#4caf50'
    };
    return colors[priority] || '#999';
  }

  getTaskStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'pending': 'Pendiente',
      'completed': 'Completada',
      'overdue': 'Retrasada',
      'cancelled': 'Cancelada'
    };
    return labels[status] || status;
  }

  getUrgentTasksByPriority(priority: string): Task[] {
    return this.allUrgentTasks.filter(task => task.priority === priority);
  }
}
