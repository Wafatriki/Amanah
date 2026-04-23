import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ClinicalDocumentService } from '../../services/clinical-document.service';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { ClinicalDocument, DOCUMENT_TYPE_LABELS, ALLOWED_MIME_TYPES } from '../../models/clinical-document.model';

@Component({
  selector: 'app-document-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-upload.component.html',
  styleUrls: ['./document-upload.component.scss']
})
export class DocumentUploadComponent implements OnInit, OnDestroy {
  @Input() dependentId!: string;
  @Input() appointmentId?: string;
  @Input() medicationId?: string;
  @Output() documentUploaded = new EventEmitter<ClinicalDocument>();
  @Output() uploadCancelled = new EventEmitter<void>();

  selectedFile: File | null = null;
  filePreview: string | null = null;
  isUploading = false;
  uploadProgress = 0;
  errorMessage = '';
  successMessage = '';

  documentType: 'appointment' | 'medication' | 'lab' | 'imaging' | 'prescription' | 'report' | 'other' = 'other';
  documentTitle = '';
  documentDescription = '';
  isPrivate = false;

  documentTypes = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
    value: value as any,
    label
  }));

  private destroy$ = new Subject<void>();

  constructor(
    private clinicalDocumentService: ClinicalDocumentService,
    private authService: AuthService,
    private permissionService: PermissionService
  ) {}

  ngOnInit(): void {
    // Pre-seleccionar tipo de documento basado en input
    if (this.appointmentId) {
      this.documentType = 'appointment';
    } else if (this.medicationId) {
      this.documentType = 'medication';
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.handleFile(event.dataTransfer.files[0]);
    }
  }

  private handleFile(file: File): void {
    this.errorMessage = '';

    // Validar tipo MIME
    if (!this.isAllowedMimeType(file.type)) {
      this.errorMessage = `Tipo de archivo no permitido. Tipos permitidos: ${ALLOWED_MIME_TYPES.join(', ')}`;
      return;
    }

    // Validar tamaño
    const maxSizeMB = 10;
    if (file.size > maxSizeMB * 1024 * 1024) {
      this.errorMessage = `El archivo excede el tamaño máximo de ${maxSizeMB} MB. Tamaño actual: ${(file.size / 1024 / 1024).toFixed(2)} MB`;
      return;
    }

    this.selectedFile = file;
    this.generatePreview(file);
  }

  private isAllowedMimeType(mimeType: string): boolean {
    return ALLOWED_MIME_TYPES.includes(mimeType);
  }

  private generatePreview(file: File): void {
    const reader = new FileReader();

    reader.onload = (e) => {
      if (file.type.startsWith('image/')) {
        this.filePreview = e.target?.result as string;
      } else if (file.type === 'application/pdf') {
        // Para PDF, mostrar icono
        this.filePreview = null;
      } else {
        this.filePreview = null;
      }
    };

    reader.readAsDataURL(file);
  }

  getFileIcon(): string {
    if (!this.selectedFile) return '';

    if (this.selectedFile.type.startsWith('image/')) return '/assets/icons/radiografia-osea.png';
    if (this.selectedFile.type === 'application/pdf') return '/assets/icons/certificado.png';
    if (this.selectedFile.type.includes('word')) return '/assets/icons/notas-medicas.png';
    return '/assets/icons/certificado.png';
  }

  uploadFile(): void {
    if (!this.selectedFile || !this.dependentId) {
      this.errorMessage = 'Por favor selecciona un archivo';
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.errorMessage = 'Usuario no autenticado';
      return;
    }

    // Check permission to upload documents
    if (!this.permissionService.canUploadDocument()) {
      this.errorMessage = 'No tienes permiso para subir documentos';
      return;
    }

    this.isUploading = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Obtener nombre real del usuario
    this.authService.getCurrentUserFullName().then(fullName => {
      const fileName = this.selectedFile!.name;
      const metadata: Omit<ClinicalDocument, 'id' | 'storagePath' | 'uploadDate' | 'createdAt' | 'updatedAt' | 'fileSize' | 'fileType' | 'fileName'> & { fileName: string } = {
        fileName,
        dependentId: this.dependentId,
        documentType: this.documentType,
        title: this.documentTitle || fileName,
        description: this.documentDescription,
        uploadedBy: currentUser.uid,
        uploadedByName: fullName,
        isPrivate: this.isPrivate,
        accessibleBy: this.isPrivate ? [] : [],
        ...(this.appointmentId && { appointmentId: this.appointmentId }),
        ...(this.medicationId && { medicationId: this.medicationId })
      } as any;

      this.clinicalDocumentService
        .uploadDocument(this.dependentId, this.selectedFile!, metadata as any)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (document) => {
            this.isUploading = false;
            this.uploadProgress = 100;
            this.successMessage = `Documento "${document.fileName}" subido exitosamente`;

            // Emitir evento
            this.documentUploaded.emit(document);

            // Resetear formulario después de 2 segundos
            setTimeout(() => {
              this.resetForm();
            }, 2000);
          },
          error: (error) => {
            this.isUploading = false;
            this.uploadProgress = 0;
            this.errorMessage = error.message || 'Error al subir el documento';
          }
        });
    });
  }

  resetForm(): void {
    this.selectedFile = null;
    this.filePreview = null;
    this.documentTitle = '';
    this.documentDescription = '';
    this.isPrivate = false;
    this.uploadProgress = 0;
    this.successMessage = '';
    this.errorMessage = '';
    this.documentType = this.appointmentId ? 'appointment' : this.medicationId ? 'medication' : 'other';
  }

  cancel(): void {
    this.resetForm();
    this.uploadCancelled.emit();
  }
}
