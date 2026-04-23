import { Component, Input, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Medication } from '../../models/medication.model';

interface CalendarSchedule {
  time: string;
  medication: string;
  medicationId: string;
  dose: string;
  presentation: string;
}

interface CalendarDay {
  date: Date;
  day: number;
  month: number;
  isCurrentMonth: boolean;
  schedules: CalendarSchedule[];
  completed: number;
  total: number;
}

@Component({
  selector: 'app-medication-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './medication-calendar.component.html',
  styleUrls: ['./medication-calendar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MedicationCalendarComponent implements OnInit {
  @Input() medications: Medication[] = [];
  @Input() dependentId!: string;

  currentDate = new Date();
  calendarDays: CalendarDay[] = [];
  monthName: string = '';
  weekDays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

  selectedSchedule: CalendarSchedule | null = null;
  selectedMedicationDetails: Medication | null = null;
  selectedDaySchedules: CalendarSchedule[] = [];
  showDaySchedulesModal = false;

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    this.generateCalendar();
  }

  generateCalendar(): void {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    this.monthName = new Date(year, month).toLocaleDateString('es-ES', {
      month: 'long',
      year: 'numeric'
    });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const previousMonth = new Date(year, month, 0);

    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const daysInPreviousMonth = previousMonth.getDate();

    this.calendarDays = [];

    // Add days from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, daysInPreviousMonth - i);
      this.calendarDays.push(this.createCalendarDay(date, false));
    }

    // Add days of current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      this.calendarDays.push(this.createCalendarDay(date, true));
    }

    // Add days from next month
    const remainingDays = 42 - this.calendarDays.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      this.calendarDays.push(this.createCalendarDay(date, false));
    }

    this.cdr.markForCheck();
  }

  private createCalendarDay(date: Date, isCurrentMonth: boolean): CalendarDay {
    const dateStr = this.formatDateForComparison(date);
    const schedules: CalendarSchedule[] = [];

    // Get schedules for this day
    if (isCurrentMonth) {
      this.medications.forEach(med => {
        // Verificar que la medicación sea válida para esta fecha
        const startDate = new Date(med.startDate);
        startDate.setHours(0, 0, 0, 0);

        // Verificar si la medicación ya ha comenzado
        if (startDate > date) {
          return; // Medicación aún no ha comenzado
        }

        // Verificar si la medicación ha terminado
        if (med.endDate) {
          const endDate = new Date(med.endDate);
          endDate.setHours(0, 0, 0, 0);
          if (endDate < date) {
            return; // Medicación ya ha terminado
          }
        }

        // Verificar que la medicación esté activa
        if (!med.isActive) {
          return; // Medicación no está activa
        }

        // Si llegamos aquí, la medicación es válida para esta fecha
        med.schedules.forEach(schedule => {
          // Validar que schedule.time existe y es válido
          if (schedule.time && typeof schedule.time === 'string') {
            schedules.push({
              time: schedule.time,
              medication: med.name,
              medicationId: med.id || '',
              dose: med.dose || '',
              presentation: med.presentation || ''
            });
          }
        });
      });
    }

    return {
      date,
      day: date.getDate(),
      month: date.getMonth(),
      isCurrentMonth,
      schedules: schedules.sort((a, b) => a.time.localeCompare(b.time)),
      completed: 0,
      total: schedules.length
    };
  }

  previousMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendar();
  }

  nextMonth(): void {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendar();
  }

  goToday(): void {
    this.currentDate = new Date();
    this.generateCalendar();
  }

  getCompletionPercentage(day: CalendarDay): number {
    if (day.total === 0) return 0;
    return Math.round((day.completed / day.total) * 100);
  }

  isToday(day: CalendarDay): boolean {
    const today = new Date();
    return (
      day.date.getDate() === today.getDate() &&
      day.date.getMonth() === today.getMonth() &&
      day.date.getFullYear() === today.getFullYear()
    );
  }

  isWeekend(day: CalendarDay): boolean {
    const dayOfWeek = day.date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  private formatDateForComparison(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  getCalendarWeeks(): CalendarDay[][] {
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < this.calendarDays.length; i += 7) {
      weeks.push(this.calendarDays.slice(i, i + 7));
    }
    return weeks;
  }

  getTotalSchedulesForDay(day: CalendarDay): number {
    return day.schedules.length;
  }

  trackByDayDate(index: number, day: CalendarDay): string {
    return day.date.toISOString();
  }

  trackByScheduleIndex(index: number): number {
    return index;
  }

  showScheduleDetails(schedule: CalendarSchedule): void {
    this.selectedSchedule = schedule;
    // Buscar la medicación completa para mostrar todos sus detalles
    this.selectedMedicationDetails = this.medications.find(med => med.id === schedule.medicationId) || null;
    this.cdr.markForCheck();
  }

  closeScheduleDetails(): void {
    this.selectedSchedule = null;
    this.selectedMedicationDetails = null;
    this.cdr.markForCheck();
  }

  showDaySchedules(day: CalendarDay): void {
    this.selectedDaySchedules = day.schedules;
    this.showDaySchedulesModal = true;
    this.cdr.markForCheck();
  }

  closeDaySchedules(): void {
    this.showDaySchedulesModal = false;
    this.selectedDaySchedules = [];
    this.cdr.markForCheck();
  }
}
