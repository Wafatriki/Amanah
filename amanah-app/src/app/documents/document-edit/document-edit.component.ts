import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ClinicalDocumentService } from '../../services/clinical-document.service';
import { ClinicalDocument, DOCUMENT_TYPE_LABELS } from '../../models/clinical-document.model';

@Component({
  selector: 'app-document-edit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-edit.component.html',
  styleUrls: ['./document-edit.component.scss']
})
export class DocumentEditComponent implements OnInit, OnDestroy {
  @Input() document!: ClinicalDocument;
  @Input() dependentId!: string;
  @Output() closed = new EventEmitter<void>();
  @Output() updated = new EventEmitter<ClinicalDocument>();

  // Formulario
  editTitle = '';
  editDescription = '';
  editDocumentType: any = 'other';
  editIsPrivate = false;

  isSaving = false;
  errorMessage = '';
  successMessage = '';

  documentTypes = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label
  }));

  private destroy$ = new Subject<void>();

  constructor(private clinicalDocumentService: ClinicalDocumentService) {}

  ngOnInit(): void {
    // Cargar valores actuales
    this.editTitle = this.document.title;
    this.editDescription = this.document.description || '';
    this.editDocumentType = this.document.documentType;
    this.editIsPrivate = this.document.isPrivate;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  saveChanges(): void {
    if (!this.editTitle.trim()) {
      this.errorMessage = 'El título no puede estar vacío';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    const updates = {
      title: this.editTitle,
      description: this.editDescription,
      documentType: this.editDocumentType,
      isPrivate: this.editIsPrivate
    };

    this.clinicalDocumentService
      .updateDocument(this.dependentId, this.document.id!, updates)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.successMessage = 'Documento actualizado exitosamente';

          // Emitir documento actualizado
          const updatedDoc: ClinicalDocument = {
            ...this.document,
            ...updates,
            updatedAt: new Date()
          };
          this.updated.emit(updatedDoc);

          // Cerrar después de 1.5 segundos
          setTimeout(() => {
            this.close();
          }, 1500);
        },
        error: (error) => {
          this.isSaving = false;
          this.errorMessage = error.message || 'Error al actualizar el documento';
        }
      });
  }

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }
}
