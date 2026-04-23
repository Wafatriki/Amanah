import { Component, OnInit, OnDestroy, Input, ChangeDetectorRef, SimpleChanges, OnChanges, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ClinicalDocumentService } from '../../services/clinical-document.service';
import { AuthService } from '../../services/auth.service';
import { PermissionService } from '../../services/permission.service';
import { UiFeedbackService } from '../../services/ui-feedback.service';
import { NotificationService } from '../../services/notification.service';
import { ClinicalDocument, DOCUMENT_TYPE_LABELS } from '../../models/clinical-document.model';
import { DocumentPreviewComponent } from '../document-preview/document-preview.component';
import { DocumentEditComponent } from '../document-edit/document-edit.component';

@Component({
  selector: 'app-document-list',
  standalone: true,
  imports: [CommonModule, FormsModule, DocumentPreviewComponent, DocumentEditComponent],
  templateUrl: './document-list.component.html',
  styleUrls: ['./document-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentListComponent implements OnInit, OnDestroy, OnChanges {
  @Input() dependentId!: string;

  documents: ClinicalDocument[] = [];
  filteredDocuments: ClinicalDocument[] = [];
  selectedDocument: ClinicalDocument | null = null;
  documentToEdit: ClinicalDocument | null = null;
  isLoading = true;
  errorMessage = '';
  filterType: string = 'all';
  searchTerm = '';

  currentUserId: string = '';
  currentUserRole: string = '';

  documentTypeLabels = DOCUMENT_TYPE_LABELS;
  documentTypeList = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label
  }));

  private destroy$ = new Subject<void>();

  constructor(
    private clinicalDocumentService: ClinicalDocumentService,
    private authService: AuthService,
    private permissionService: PermissionService,
    private uiFeedbackService: UiFeedbackService,
    private notificationService: NotificationService,
    private cdr: ChangeDetectorRef
  ) {
    const user = this.authService.getCurrentUser();
    if (user) {
      this.currentUserId = user.uid;
      this.currentUserRole = user.email?.includes('admin') ? 'admin' : 'user';
    }
  }

  ngOnInit(): void {
    this.loadDocuments();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Recargar documentos cuando cambio el dependentId
    if (changes['dependentId'] && !changes['dependentId'].firstChange) {
      console.log(`dependentId cambió, recargando documentos...`);
      this.destroy$.next(); // Cancelar suscripción anterior
      this.loadDocuments();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDocuments(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.clinicalDocumentService
      .getDocumentsByDependent(this.dependentId, this.currentUserId, this.currentUserRole)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (docs) => {
          console.log(`Recibidos ${docs.length} documentos en el componente`);
          this.documents = docs;
          this.applyFilters();
          this.isLoading = false;
          this.cdr.markForCheck(); // Forzar detección de cambios
          console.log(`filteredDocuments ahora tiene ${this.filteredDocuments.length} items`);
        },
        error: (error) => {
          this.errorMessage = 'Error al cargar los documentos';
          this.isLoading = false;
          console.error(error);
          this.cdr.markForCheck();
        }
      });
  }

  applyFilters(): void {
    this.filteredDocuments = this.documents.filter(doc => {
      // Filtro por tipo
      if (this.filterType !== 'all' && doc.documentType !== this.filterType) {
        return false;
      }

      // Filtro por búsqueda
      if (this.searchTerm) {
        const term = this.searchTerm.toLowerCase();
        return (
          doc.fileName.toLowerCase().includes(term) ||
          doc.title?.toLowerCase().includes(term) ||
          doc.description?.toLowerCase().includes(term)
        );
      }

      return true;
    });
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  onSearchChange(): void {
    this.applyFilters();
  }

  viewDocument(document: ClinicalDocument): void {
    this.selectedDocument = document;
    // Registrar acceso con nombre real del usuario
    this.authService.getCurrentUserFullName().then(fullName => {
      this.clinicalDocumentService
        .logDocumentAccess(
          this.dependentId,
          document.id!,
          this.currentUserId,
          fullName,
          this.currentUserRole,
          'view'
        )
        .pipe(takeUntil(this.destroy$))
        .subscribe();
    });
  }

  downloadDocument(clinicalDoc: ClinicalDocument): void {
    this.clinicalDocumentService
      .downloadDocument(clinicalDoc.storagePath)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (downloadUrl: string) => {
          // Registrar acceso con nombre real del usuario
          this.authService.getCurrentUserFullName().then(fullName => {
            this.clinicalDocumentService
              .logDocumentAccess(
                this.dependentId,
                clinicalDoc.id!,
                this.currentUserId,
                fullName,
                this.currentUserRole,
                'download'
              )
              .pipe(takeUntil(this.destroy$))
              .subscribe();
          });

          // Descargar usando la URL firmada en una pestaña nueva
          window.open(downloadUrl, '_blank');
        },
        error: (error) => {
          console.error('Error descargando documento:', error);
          this.notificationService.notifyError('Error', 'No se pudo descargar el documento');
        }
      });
  }

  async deleteDocument(document: ClinicalDocument): Promise<void> {
    // Solo cuidadores pueden eliminar
    if (this.permissionService.isReadOnly()) {
      this.notificationService.notifyError('Sin permisos', 'No tienes permisos para eliminar documentos');
      return;
    }

    const confirmed = await this.uiFeedbackService.confirm({
      title: 'Eliminar documento',
      message: `¿Deseas eliminar "${document.fileName}"?`,
      confirmText: 'Eliminar',
      cancelText: 'Cancelar',
      dangerous: true
    });

    if (!confirmed) {
      return;
    }

    this.clinicalDocumentService
      .deleteDocument(this.dependentId, document.id!, document.storagePath)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadDocuments();
          this.notificationService.notifySuccess('Documento eliminado', 'El documento se eliminó correctamente');
        },
        error: (error) => {
          console.error('Error eliminando documento:', error);
          this.notificationService.notifyError('Error', 'No se pudo eliminar el documento');
        }
      });
  }

  shareDocument(document: ClinicalDocument): void {
    const userIds = prompt('Ingresa los IDs de usuarios separados por comas:');
    if (!userIds) return;

    const ids = userIds
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (ids.length === 0) return;

    this.clinicalDocumentService
      .shareDocument(this.dependentId, document.id!, ids)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadDocuments();
          this.notificationService.notifySuccess('Documento compartido', 'El documento se compartió correctamente');
        },
        error: (error) => {
          console.error('Error compartiendo documento:', error);
          this.notificationService.notifyError('Error', 'No se pudo compartir el documento');
        }
      });
  }

  closePreview(): void {
    this.selectedDocument = null;
  }

  editDocument(document: ClinicalDocument): void {
    this.documentToEdit = document;
  }

  closeEdit(): void {
    this.documentToEdit = null;
  }

  onDocumentUpdated(updatedDocument: ClinicalDocument): void {
    // Actualizar la lista local
    const index = this.documents.findIndex(doc => doc.id === updatedDocument.id);
    if (index !== -1) {
      this.documents[index] = updatedDocument;
      this.applyFilters();
      this.cdr.markForCheck();
    }
    this.documentToEdit = null;
  }

  canDeleteDocument(document: ClinicalDocument): boolean {
    // Check if user is read-only (invited)
    if (this.permissionService.isReadOnly()) {
      return false;
    }
    // Allow if admin or if user uploaded the document
    return this.permissionService.canDeleteDocument();
  }

  canEditDocument(document: ClinicalDocument): boolean {
    // Check if user is read-only (invited)
    if (this.permissionService.isReadOnly()) {
      return false;
    }
    // Allow if user has edit permission (caregivers and admins)
    return this.permissionService.canEditDocument();
  }

  getDocumentTypeLabel(type: string): string {
    return DOCUMENT_TYPE_LABELS[type as keyof typeof DOCUMENT_TYPE_LABELS] || type;
  }

  getDocumentIcon(documentType: string): string {
    const icons: { [key: string]: string } = {
      appointment: '/assets/icons/calendario.png',
      medication: '/assets/medication-icons/pastillas.png',
      lab: '/assets/icons/laboratorio.png',
      imaging: '/assets/icons/radiografia-osea.png',
      prescription: '/assets/icons/reporte.png',
      report: '/assets/icons/reporte.png',
      other: '/assets/icons/certificado.png'
    };
    return icons[documentType] || '/assets/icons/certificado.png';
  }
}
