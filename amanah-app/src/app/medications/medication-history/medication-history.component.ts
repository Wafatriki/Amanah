import { Component, Input, OnInit, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MedicationService } from '../../services/medication.service';
import { Medication } from '../../models/medication.model';

@Component({
  selector: 'app-medication-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './medication-history.component.html',
  styleUrls: ['./medication-history.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MedicationHistoryComponent implements OnInit, OnChanges {
  @Input() medicationId!: string;
  @Input() dependentId!: string;
  @Input() medication!: Medication;

  historicalSchedules: any[] = [];
  loading = false;
  error: string | null = null;
  selectedDateRange: 'week' | 'month' | 'all' = 'month';

  completedCount = 0;
  pendingCount = 0;
  missedCount = 0;

  constructor(
    private medicationService: MedicationService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.loadHistory();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ((changes['medicationId'] || changes['dependentId']) && !changes['medicationId']?.firstChange && !changes['dependentId']?.firstChange) {
      // Solo recargar si el medicationId o dependentId cambió (no en la primera inicialización)
      this.historicalSchedules = [];
      this.loadHistory();
    }
  }

  loadHistory(): void {
    if (!this.dependentId || !this.medicationId) return;

    this.loading = true;
    const startDate = this.getStartDate();

    this.medicationService
      .getMedicationHistory(this.dependentId, this.medicationId, startDate, new Date())
      .subscribe({
        next: (history: any) => {
          // Ensure history is an array and sort by date descending
          this.historicalSchedules = Array.isArray(history) ? history : [];
          this.historicalSchedules.sort((a: any, b: any) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
          );

          this.calculateStats();
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.error = 'Error al cargar el historial';
          console.error(err);
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  calculateStats(): void {
    // Contar todas las dosis completadas en el historial
    this.completedCount = this.historicalSchedules.reduce((count, historyEntry) => {
      return count + (historyEntry.schedules?.filter((s: any) => s.completed).length || 0);
    }, 0);

    // Contar las pendientes (futuras sin completar)
    this.pendingCount = this.historicalSchedules.reduce((count, historyEntry) => {
      if (this.isSchedulePending(historyEntry)) {
        return count + (historyEntry.schedules?.filter((s: any) => !s.completed).length || 0);
      }
      return count;
    }, 0);

    // Contar las perdidas (pasadas sin completar)
    this.missedCount = this.historicalSchedules.reduce((count, historyEntry) => {
      if (this.isScheduleMissed(historyEntry)) {
        return count + (historyEntry.schedules?.filter((s: any) => !s.completed).length || 0);
      }
      return count;
    }, 0);
  }

  isSchedulePending(schedule: any): boolean {
    return new Date(schedule.date) > new Date();
  }

  isScheduleMissed(schedule: any): boolean {
    return new Date(schedule.date) < new Date();
  }

  isScheduleCompleted(schedule: any): boolean {
    return schedule.completed === true;
  }

  private getStartDate(): Date {
    const now = new Date();
    const startDate = new Date(now);

    switch (this.selectedDateRange) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case 'all':
        startDate.setFullYear(startDate.getFullYear() - 5);
        break;
    }

    // Normalizar para que comience a las 00:00:00
    startDate.setHours(0, 0, 0, 0);
    return startDate;
  }

  onDateRangeChange(range: 'week' | 'month' | 'all'): void {
    this.selectedDateRange = range;
    this.loadHistory();
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('es-ES', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getCompletionPercentage(): number {
    const totalSchedules = this.historicalSchedules.reduce((count, historyEntry) => {
      return count + (historyEntry.schedules?.length || 0);
    }, 0);

    if (totalSchedules === 0) return 0;
    return Math.round((this.completedCount / totalSchedules) * 100);
  }
}
