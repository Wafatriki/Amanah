import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Task, PRIORITY_COLORS } from '../../models/task.model';
import { TaskService } from '../../services/task.service';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { AuthService } from '../../services/auth.service';
import { DependentService } from '../../services/dependent.service';
import { UiFeedbackService } from '../../services/ui-feedback.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-caregiver-tasks',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './caregiver-tasks.component.html',
  styleUrl: './caregiver-tasks.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaregiverTasksComponent implements OnInit, OnDestroy {
  myTasks: Task[] = [];
  allDependentsList: any[] = [];
  loading = true;
  userId: string | null = null;
  selectedDependentId: string | null = null;

  priorityColorMap = PRIORITY_COLORS;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly taskService: TaskService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly authService: AuthService,
    private readonly dependentService: DependentService,
    private readonly uiFeedbackService: UiFeedbackService,
    private readonly notificationService: NotificationService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const currentUser = this.authService.getCurrentUser();
    this.userId = currentUser?.uid || null;
    const activeDependentId = this.activeDependentService.getActiveDependentId();

    if (!this.userId) {
      this.router.navigate(['/login']);
      return;
    }

    this.selectedDependentId = activeDependentId;
    this.loadMyTasks();
  }

  loadMyTasks(): void {
    if (!this.userId) return;

    this.loading = true;

    // Cargar tareas asignadas al usuario actual
    this.taskService
      .getTasksAssignedToUser(this.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (tasks: Task[]) => {
          // Filtrar solo las pendientes (no completadas)
          this.myTasks = tasks.filter(t => t.status !== 'completed').sort((a, b) => {
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          });
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading my tasks:', err);
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  async completeTask(taskId: string | undefined): Promise<void> {
    if (!taskId || !this.userId) return;

    try {
      await this.taskService.completeTask(taskId, this.userId, undefined, this.selectedDependentId || undefined);
      console.log('Task completed');
      this.myTasks = this.myTasks.filter(t => t.id !== taskId);
      this.cdr.markForCheck();
    } catch (error) {
      console.error('Error completing task:', error);
    }
  }

  editTask(taskId: string | undefined): void {
    if (!taskId) return;
    this.router.navigate(['/tasks/edit', taskId]);
  }

  async deleteTask(taskId: string | undefined): Promise<void> {
    if (!taskId) return;

    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar tarea',
      message: 'La tarea se eliminará de forma permanente.',
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (confirmed) {
      try {
        await this.taskService.deleteTask(taskId, this.selectedDependentId || undefined);
        console.log('Task deleted');
        this.myTasks = this.myTasks.filter(t => t.id !== taskId);
        this.cdr.markForCheck();
        this.notificationService.notifySuccess('Tarea eliminada', 'La tarea se eliminó correctamente');
      } catch (error) {
        console.error('Error deleting task:', error);
        this.notificationService.notifyError('Error', 'No se pudo eliminar la tarea');
      }
    }
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
    const daysUntil = this.getDaysUntilDue(dueDate);
    if (daysUntil < 0) return 'Vencida';
    if (daysUntil === 0) return 'Hoy';
    if (daysUntil === 1) return 'Mañana';
    return `${daysUntil} días`;
  }

  isUrgent(task: Task): boolean {
    return this.getDaysUntilDue(task.dueDate) <= 1 || task.priority === 'high';
  }

  getUrgentTasks(): Task[] {
    return this.myTasks.filter((t) => this.isUrgent(t));
  }

  getNonUrgentTasks(): Task[] {
    return this.myTasks.filter((t) => !this.isUrgent(t));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
