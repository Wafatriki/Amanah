import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Dependent } from '../../models/dependent.model';
import { Medication } from '../../models/medication.model';
import { Task } from '../../models/task.model';
import { Appointment } from '../../models/appointment.model';
import { User } from '../../models/user.model';
import { ExportService } from '../../services/export.service';

@Component({
  selector: 'app-export-data',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './export-data.component.html',
  styleUrl: './export-data.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExportDataComponent {
  @Input() dependent!: Dependent;
  @Input() medications: Medication[] = [];
  @Input() tasks: Task[] = [];
  @Input() appointments: Appointment[] = [];
  @Input() caregivers: User[] = [];
  @Output() closeModal = new EventEmitter<void>();

  exportFormat: 'json' | 'csv' | 'txt' = 'json';
  isExporting = false;
  successMessage = '';

  constructor(
    private readonly exportService: ExportService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  onExport(): void {
    if (!this.dependent) return;

    this.isExporting = true;
    this.successMessage = '';

    try {
      switch (this.exportFormat) {
        case 'json':
          this.exportService.exportDependentToJSON(
            this.dependent,
            this.medications,
            this.tasks,
            this.appointments,
            this.caregivers
          );
          this.successMessage = 'Datos exportados a JSON correctamente';
          break;
        case 'csv':
          this.exportService.exportDependentToCSV(
            this.dependent,
            this.medications,
            this.tasks,
            this.appointments,
            this.caregivers
          );
          this.successMessage = 'Datos exportados a CSV correctamente';
          break;
        case 'txt':
          this.exportService.exportDependentToText(
            this.dependent,
            this.medications,
            this.tasks,
            this.appointments,
            this.caregivers
          );
          this.successMessage = 'Datos exportados a TXT correctamente';
          break;
      }

      setTimeout(() => {
        this.onClose();
      }, 1000);
    } catch (error) {
      console.error('Error exporting data:', error);
    } finally {
      this.isExporting = false;
      this.cdr.markForCheck();
    }
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
