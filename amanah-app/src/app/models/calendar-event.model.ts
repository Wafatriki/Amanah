export interface CalendarEvent {
  id?: string;
  dependentId: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  type: 'task' | 'appointment' | 'medication' | 'other';
  color?: string;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
  reminder?: boolean;
  reminderTime?: number; // en minutos antes del evento
  notes?: string;
  // Recurrencia
  recurrence?: RecurrenceConfig;
  parentEventId?: string; // Para eventos generados por recurrencia
}

export interface RecurrenceConfig {
  frequency: 'never' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  endsAfterDays?: number;
  endDate?: Date;
  daysOfWeek?: number[]; // 0-6 para monthly/weekly
}

export type EventType = 'task' | 'appointment' | 'medication' | 'other';

export const EVENT_COLORS: Record<EventType, string> = {
  task: '#E8D4F1',
  appointment: '#ADD8E6',
  medication: '#FFD4D4',
  other: '#FFFACD',
};

export const EVENT_LABELS: Record<EventType, string> = {
  task: 'Tarea',
  appointment: 'Cita',
  medication: 'Medicación',
  other: 'Otro',
};
