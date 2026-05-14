import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Task, TASK_STATUSES, PRIORITY_COLORS } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { DependentService } from '../../services/dependent.service';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { UiFeedbackService } from '../../services/ui-feedback.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskListComponent implements OnInit, OnDestroy {
  tasks: Task[] = [];
  filteredTasks: Task[] = [];
  loading = true;
  dependentId: string | null = null;
  userId: string | null = null;

  // Pestañas de tareas (hoy vs otros días)
  activeTab: 'today' | 'other' = 'today';

  // Filtros
  selectedFilter: 'all' | 'pending' | 'completed' | 'overdue' = 'all';
  sortBy: 'dueDate' | 'priority' | 'createdAt' = 'dueDate';
  selectedCaregiverId: string | null = null;
  showFilters = false;  // Control de visibilidad del panel de filtros
  showAllTasks = true; // Por defecto mostrar todas las tareas del dependiente

  // Modal de detalles
  showDetailModal = false;
  selectedTask: Task | null = null;

  priorityColorMap = PRIORITY_COLORS;

  getAssigneeName(userId: string): string {
    // Look up current name from caregivers list
    const caregiver = this.caregivers.find(c => c.userId === userId);
    return caregiver?.name || userId;
  }

  getAssignedToNames(): string {
    if (!this.selectedTask?.assignedTo) return '';
    return this.selectedTask.assignedTo.map((a: any) => this.getAssigneeName(a.userId)).join(', ');
  }
  statusLabels = TASK_STATUSES;
  caregivers: { userId: string; name: string }[] = [];

  // Track tasks being updated to prevent race conditions
  private updatingTaskIds = new Set<string>();

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly taskService: TaskService,
    private readonly dependentService: DependentService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly authService: AuthService,
    private readonly permissionService: PermissionService,
    private readonly uiFeedbackService: UiFeedbackService,
    private readonly notificationService: NotificationService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.userId = currentUser?.uid || null;
    const activeDependentId = this.activeDependentService.getActiveDependentId();

    if (!activeDependentId) {
      this.router.navigate(['/dependent-selector']);
      return;
    }

    this.dependentId = activeDependentId;

    // Leer el parámetro 'tab' de la URL para navegar automáticamente después de crear una tarea
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      if (params['tab'] && (params['tab'] === 'today' || params['tab'] === 'other')) {
        this.activeTab = params['tab'];
        // Remover el queryParam de la URL después de procesarlo
        this.router.navigate(['/tasks'], { queryParams: {}, replaceUrl: true });
      }
      this.cdr.markForCheck();
    });

    // Cargar cuidadores primero, luego cargar tareas
    this.loadCaregivers(activeDependentId).then(() => {
      this.loadTasks();
    });
  }

  loadTasks(): void {
    if (!this.dependentId) return;

    this.loading = true;
    this.taskService
      .getTasksByDependentLive(this.dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tasks: Task[]) => {
          // Normalizar tareas al formato nuevo {userId, name}
          let normalizedTasks = tasks.map(task => this.normalizeTask(task));
          // Expandir tareas recurrentes en múltiples instancias
          this.tasks = this.expandRecurringTasks(normalizedTasks);
          this.applyFiltersAndSort();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading tasks:', err);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  private expandRecurringTasks(tasks: Task[]): Task[] {
    const expandedTasks: Task[] = [];
    const dayMap: { [key: string]: number } = {
      'sunday': 0,
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5,
      'saturday': 6,
    };

    tasks.forEach(task => {
      // Si tiene recurrencia semanal con días específicos, generar instancias para cada día
      if (task.recurrence?.frequency === 'weekly' &&
          task.recurrence?.daysOfWeek &&
          task.recurrence.daysOfWeek.length > 0) {

        const startDate = new Date(task.dueDate);

        // Convertir strings de días a números si es necesario
        let daysAsNumbers: number[] = task.recurrence.daysOfWeek.map(day => {
          if (typeof day === 'number') {
            return day;
          }
          return dayMap[day as string];
        }).filter(d => d !== undefined);

        // Calcular fecha final
        let endDate = new Date(startDate);
        if (task.recurrence.endsAfterDays) {
          endDate.setDate(endDate.getDate() + task.recurrence.endsAfterDays);
        } else if (task.recurrence.endDate) {
          endDate = new Date(task.recurrence.endDate);
        } else {
          // Por defecto, 3 meses de recurrencia
          endDate.setMonth(endDate.getMonth() + 3);
        }

        // Generar instancias para cada día de recurrencia
        const currentDate = new Date(startDate);
        while (currentDate <= endDate) {
          const dayOfWeek = currentDate.getDay();
          if (daysAsNumbers.includes(dayOfWeek)) {
            // Crear una instancia clonada con la fecha específica
            // IMPORTANT: Use LOCAL date format (YYYY-MM-DD), not UTC
            const dateStr = this.getLocalDateString(currentDate);

            // Comprobar si hay una excepción para esta fecha
            let instanceDate = new Date(currentDate);
            let displayDate = dateStr;

            if (task.recurrenceExceptions) {
              const exception = task.recurrenceExceptions.find(ex => ex.originalDate === dateStr);
              if (exception) {
                // Aplicar la excepción: cambiar la fecha de la instancia
                const [exYear, exMonth, exDay] = exception.newDate.split('-').map(Number);
                instanceDate = new Date(exYear, exMonth - 1, exDay);
                displayDate = exception.newDate;
                console.log(`Applying exception: ${dateStr} → ${exception.newDate}`);
              }
            }

            const isCompleted = task.completedInstances?.includes(displayDate) || false;

            const instance: Task = {
              ...task,
              id: `${task.id}-${currentDate.getTime()}`,
              dueDate: instanceDate,
              parentTaskId: task.id, // Marcar como instancia de una tarea recurrente
              status: isCompleted ? 'completed' : task.status, // Estado basado en completedInstances
              instanceDate: displayDate, // Guardar la fecha de esta instancia
            };
            expandedTasks.push(instance);
          }
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        // Tarea sin recurrencia semanal con días específicos, agregar tal cual
        expandedTasks.push(task);
      }
    });

    return expandedTasks;
  }

  private getLocalDateString(date: Date): string {
    // Convert date to local date string in YYYY-MM-DD format
    // This ensures consistency across timezones
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isTaskToday(task: Task): boolean {
    const today = new Date();
    const taskDate = new Date(task.dueDate);
    return (
      today.getDate() === taskDate.getDate() &&
      today.getMonth() === taskDate.getMonth() &&
      today.getFullYear() === taskDate.getFullYear()
    );
  }

  private isTaskInFuture(task: Task): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(task.dueDate);
    taskDate.setHours(0, 0, 0, 0);
    return taskDate > today;
  }

  private applyFiltersAndSort(): void {
    let filtered = [...this.tasks];

    // Filtrar por pestaña (hoy vs otros días)
    if (this.activeTab === 'today') {
      filtered = filtered.filter(task => this.isTaskToday(task));
    } else {
      filtered = filtered.filter(task => this.isTaskInFuture(task));
    }

    // Filtrar por estado
    if (this.selectedFilter !== 'all') {
      filtered = filtered.filter((task) => task.status === this.selectedFilter);
    }

    // Si no está mostrando todas las tareas y no hay cuidador seleccionado, mostrar solo mis tareas
    if (!this.showAllTasks && !this.selectedCaregiverId) {
      filtered = filtered.filter((task) =>
        task.assignedTo?.some((a: any) => a.userId === this.userId)
      );
    }

    // Filtrar por cuidador
    if (this.selectedCaregiverId) {
      filtered = filtered.filter((task) =>
        task.assignedTo?.some((a: any) => a.userId === this.selectedCaregiverId)
      );
    }

    // Ordenar
    filtered.sort((a, b) => {
      switch (this.sortBy) {
        case 'dueDate':
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        case 'priority': {
          const priorityOrder = { high: 0, medium: 1, low: 2 };
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        case 'createdAt':
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        default:
          return 0;
      }
    });

    this.filteredTasks = filtered;
  }

  setActiveTab(tab: 'today' | 'other'): void {
    this.activeTab = tab;
    this.applyFiltersAndSort();
  }

  setFilter(filter: 'all' | 'pending' | 'completed' | 'overdue'): void {
    this.selectedFilter = filter;
    this.applyFiltersAndSort();
  }

  setSortBy(sort: 'dueDate' | 'priority' | 'createdAt'): void {
    this.sortBy = sort;
    this.applyFiltersAndSort();
  }

  setSelectedCaregiver(caregiver: { userId: string; name: string } | null): void {
    this.selectedCaregiverId = caregiver?.userId || null;
    this.applyFiltersAndSort();
  }

  toggleFilters(): void {
    this.showFilters = !this.showFilters;
  }

  closeFilters(): void {
    this.showFilters = false;
  }

  setShowAllTasks(showAll: boolean): void {
    this.showAllTasks = showAll;
    this.applyFiltersAndSort();
  }

  getPendingCount(): number {
    return this.tasks.filter((t) => t.status === 'pending').length;
  }

  getCompletedCount(): number {
    return this.tasks.filter((t) => t.status === 'completed').length;
  }

  getOverdueCount(): number {
    return this.tasks.filter((t) => t.status === 'overdue').length;
  }

  isMyTask(task: Task): boolean {
    return this.userId ? task.assignedTo?.some((a: any) => a.userId === this.userId) || false : false;
  }

  async completeTask(taskId: string | undefined): Promise<void> {
    if (!taskId || !this.userId) return;

    // Invitados no pueden completar tareas
    if (this.permissionService.isReadOnly()) {
      return;
    }

    // Prevent multiple rapid clicks on same task
    if (this.updatingTaskIds.has(taskId)) return;

    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return;

    // Extraer el ID original para tareas recurrentes
    const originalTaskId = task.parentTaskId || taskId;
    const isRecurringInstance = !!task.parentTaskId;
    const instanceDate = task.instanceDate;

    // Mark as updating
    this.updatingTaskIds.add(taskId);

    try {
      // Update state locally IMMEDIATELY for instant UI feedback
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      task.status = newStatus;

      // If recurring instance, update parent's completedInstances
      // IMPORTANT: Never change parent task status for recurring tasks - only track completedInstances
      let completedInstancesToSave: string[] | undefined;
      let statusToSave: 'completed' | 'pending' | 'overdue' = newStatus as 'completed' | 'pending' | 'overdue';

      if (isRecurringInstance && instanceDate) {
        const parentTask = this.tasks.find(t => t.id === originalTaskId);
        if (parentTask) {
          if (!parentTask.completedInstances) {
            parentTask.completedInstances = [];
          }
          if (newStatus === 'completed' && !parentTask.completedInstances.includes(instanceDate)) {
            parentTask.completedInstances.push(instanceDate);
          } else if (newStatus === 'pending') {
            parentTask.completedInstances = parentTask.completedInstances.filter(d => d !== instanceDate);
          }
          // Use parent's completedInstances for Firestore update
          completedInstancesToSave = parentTask.completedInstances;

          // For recurring tasks, always save parent status as pending (unless all instances are completed)
          // This ensures that restarting doesn't mark all instances as completed
          statusToSave = 'pending';
        }
      }

      this.applyFiltersAndSort();
      this.cdr.markForCheck();

      // Update in Firestore in the background
      // IMPORTANT: Use parent's completedInstances for recurring tasks
      await this.taskService.setTaskStatus(originalTaskId, statusToSave, this.userId, completedInstancesToSave);
      console.log('Task status updated to:', newStatus, '| Saved to Firebase as status:', statusToSave);
    } catch (error) {
      console.error('Error updating task status:', error);
      // On error, revert the local change
      const task = this.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = task.status === 'completed' ? 'pending' : 'completed';
        this.applyFiltersAndSort();
        this.cdr.markForCheck();
      }
    } finally {
      // Remove from updating set
      this.updatingTaskIds.delete(taskId);
    }
  }

  editTask(taskId: string | undefined): void {
    if (!taskId) return;

    // Solo cuidadores pueden editar
    if (this.permissionService.isReadOnly()) {
      this.notificationService.notifyError('Sin permisos', 'No tienes permisos para editar tareas');
      return;
    }

    // Si es una tarea expandida (instancia recurrente), editar la tarea original
    const task = this.tasks.find(t => t.id === taskId);
    const originalTaskId = task?.parentTaskId || taskId;
    const instanceDate = task?.instanceDate || null; // Obtener la fecha de la instancia

    console.log('Edit task - Instance ID:', taskId, 'Original/Parent ID:', originalTaskId, 'Instance Date:', instanceDate);
    this.router.navigate(['/tasks/edit', originalTaskId], {
      state: { instanceDate } // Pasar la fecha de la instancia
    });
  }

  async deleteTask(taskId: string | undefined): Promise<void> {
    if (!taskId) return;

    // Solo cuidadores pueden eliminar
    if (this.permissionService.isReadOnly()) {
      this.notificationService.notifyError('Sin permisos', 'No tienes permisos para eliminar tareas');
      return;
    }

    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar tarea',
      message: 'Esta acción eliminará la tarea de forma permanente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (confirmed) {
      try {
        await this.taskService.deleteTask(taskId);
        console.log('Task deleted');
        this.notificationService.notifySuccess('Tarea eliminada', 'La tarea se eliminó correctamente');
      } catch (error) {
        console.error('Error deleting task:', error);
        this.notificationService.notifyError('Error', 'No se pudo eliminar la tarea');
      }
    }
  }

  createNewTask(): void {
    this.router.navigate(['/tasks/new']);
  }

  canCreateTask(): boolean {
    return !this.permissionService.isReadOnly();
  }

  canEditTask(): boolean {
    return !this.permissionService.isReadOnly();
  }

  canDeleteTask(): boolean {
    return !this.permissionService.isReadOnly();
  }

  canCompleteTask(): boolean {
    return !this.permissionService.isReadOnly();
  }

  getTaskColor(priority: string): string {
    return PRIORITY_COLORS[priority] || '#9B88B8';
  }

  getDaysUntilDue(dueDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  getDueDateLabel(dueDate: Date): string {
    if (!dueDate) return '';
    const date = new Date(dueDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  getTasksByPriority(priority: string): Task[] {
    return this.filteredTasks.filter((task) => task.priority === priority);
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

  // Modal de detalles
  showDetails(task: Task): void {
    this.selectedTask = task;
    this.showDetailModal = true;
    this.cdr.markForCheck();
  }

  closeModal(): void {
    this.showDetailModal = false;
    this.selectedTask = null;
    this.cdr.markForCheck();
  }

  updateTaskStatus(task: Task, newStatus: string): void {
    if (!task.id) return;

    const updatedTask: Partial<Task> = {
      status: newStatus as any
    };

    this.taskService
      .updateTask(task.id, updatedTask)
      .then(() => {
        if (this.selectedTask && this.selectedTask.id === task.id) {
          this.selectedTask.status = newStatus as any;
          this.cdr.markForCheck();
        }
      })
      .catch((err: any) => {
        console.error('Error updating task status:', err);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
