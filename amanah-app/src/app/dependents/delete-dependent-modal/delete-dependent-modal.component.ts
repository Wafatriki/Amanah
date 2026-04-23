import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DependentService } from '../../services/dependent.service';

@Component({
  selector: 'app-delete-dependent-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-dependent-modal.component.html',
  styleUrl: './delete-dependent-modal.component.scss',
})
export class DeleteDependentModalComponent {

  @Input() dependentName: string = '';
  @Input() dependentId: string | null = '';
  @Output() closeModal = new EventEmitter<void>();


  loading = false
  error: string | null = null;

  constructor(    private readonly dependentService: DependentService,
    private readonly router: Router) {}

  async confirm(): Promise<void> {
    if (!this.dependentId) {
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      await this.dependentService.deleteDependent(this.dependentId);
      this.closeModal.emit();
      this.router.navigate(['/dependent-selector']);

    } catch (err) {
      console.error('Error eliminando dependiente:', err);
      this.error = 'Error al eliminar dependiente';
      this.loading = false;
    }
  }



  cancel(): void {
    this.closeModal.emit();
  }




}
