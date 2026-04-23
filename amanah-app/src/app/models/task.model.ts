export interface Assignee {
  userId: string;
  name: string;
}

export interface Task {
  id?: string;
  dependentId: string;
  title: string;
  description?: string;
  dueDate: Date;
  dueTime?: string; // HH:mm format
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'completed' | 'overdue' | 'cancelled';

  // Asignación
  assignedTo: Assignee[]; // Array de {userId, name}

  // Metadatos
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  completedAt?: Date;
  completedBy?: string;

  // Notas y observaciones
  notes?: string;

  // Recurrencia
  recurrence?: RecurrenceConfig;
  parentTaskId?: string; // Para tareas generadas por recurrencia
  completedInstances?: string[]; // Array de fechas ISO completadas (para tareas recurrentes)
  instanceDate?: string; // Para instancias de tareas recurrentes (YYYY-MM-DD)
  recurrenceExceptions?: RecurrenceException[]; // Excepciones puntuales de la recurrencia

  // Turnos rotatorios
  isRotatingTask?: boolean;
  rotationDays?: number; // Cada cuántos días rota
  lastAssignedTo?: string; // Para saber cuál fue el último asignado

  // Recordatorio
  reminder?: {
    enabled: boolean;
    minutesBefore: number; // minutos antes del vencimiento (15, 30, 60, 1440 = 1 día)
  };
}

export interface RecurrenceConfig {
  frequency: 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  endsAfterDays?: number;
  endDate?: Date;
  daysOfWeek?: number[]; // 0-6 para weekly/monthly
}

export interface RecurrenceException {
  originalDate: string; // YYYY-MM-DD - fecha original según recurrencia
  newDate: string; // YYYY-MM-DD - nueva fecha para esta instancia
  dueTime?: string; // HH:mm - hora si es diferente
  reason?: string; // Motivo del cambio (opcional)
}

export interface TaskEditForm {
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
  priority: 'high' | 'medium' | 'low';
  assignedTo: Assignee[];
  notes: string;
  isRecurring: boolean;
  recurrence?: RecurrenceConfig;
  isRotatingTask: boolean;
  rotationDays: number;
}

export interface TaskAssignment {
  taskId: string;
  userId: string;
  assignedAt: Date;
  assignedBy: string;
}

export const TASK_PRIORITIES = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
} as const;

export const TASK_STATUSES = {
  pending: 'Pendiente',
  completed: 'Completada',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
} as const;

export const PRIORITY_COLORS: Record<string, string> = {
  high: '#f44336',    // Rojo
  medium: '#ff9800',  // Naranja
  low: '#4caf50',     // Verde
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#1565c0',    // Azul
  completed: '#4caf50',  // Verde
  overdue: '#f44336',    // Rojo
  cancelled: '#9e9e9e',  // Gris
};
