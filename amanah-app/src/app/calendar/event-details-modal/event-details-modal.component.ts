import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CalendarEvent, EVENT_COLORS, EVENT_LABELS } from '../../models/calendar-event.model';

@Component({
  selector: 'app-event-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './event-details-modal.component.html',
  styleUrl: './event-details-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EventDetailsModalComponent {
  @Input() event: CalendarEvent | null = null;
  @Input() isOpen = false;
  @Input() canEdit = true;
  @Input() canDelete = true;

  @Output() onClose = new EventEmitter<void>();
  @Output() onEdit = new EventEmitter<string>();
  @Output() onDelete = new EventEmitter<string>();

  readonly EVENT_COLORS = EVENT_COLORS;
  readonly EVENT_LABELS = EVENT_LABELS;

  close(): void {
    this.onClose.emit();
  }

  edit(): void {
    if (this.event?.id) {
      this.onEdit.emit(this.event.id);
    }
  }

  delete(): void {
    if (this.event?.id) {
      this.onDelete.emit(this.event.id);
    }
  }

  getFormattedStartTime(): string {
    const date = new Date(this.event?.startDate || '');
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  getFormattedEndTime(): string {
    const date = new Date(this.event?.endDate || '');
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  getFormattedDate(): string {
    const date = new Date(this.event?.startDate || '');
    return date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  getRecurrenceLabel(): string {
    const frequency = this.event?.recurrence?.frequency;
    const labels: Record<string, string> = {
      never: 'No se repite',
      daily: 'Diariamente',
      weekly: 'Semanalmente',
      monthly: 'Mensualmente',
      yearly: 'Anualmente',
    };
    return labels[frequency || 'never'] || 'No se repite';
  }

  getReminderLabel(): string {
    if (!this.event?.reminder) return 'Sin recordatorio';
    const minutes = this.event.reminderTime || 0;
    if (minutes === 0) return 'Sin recordatorio';

    // Convertir a días
    if (minutes >= 1440 && minutes % 1440 === 0) {
      const days = minutes / 1440;
      return days === 1 ? '1 día antes' : `${Math.floor(days)} días antes`;
    }

    // Convertir a horas
    if (minutes >= 60 && minutes % 60 === 0) {
      const hours = minutes / 60;
      return hours === 1 ? '1 hora antes' : `${Math.floor(hours)} horas antes`;
    }

    // Minutos
    return minutes === 1 ? '1 minuto antes' : `${minutes} minutos antes`;
  }
}

