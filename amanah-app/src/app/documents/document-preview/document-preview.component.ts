import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ClinicalDocumentService } from '../../services/clinical-document.service';
import { AuthService } from '../../services/auth.service';
import { ClinicalDocument, DocumentAccessLog, DOCUMENT_TYPE_LABELS } from '../../models/clinical-document.model';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-document-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './document-preview.component.html',
  styleUrls: ['./document-preview.component.scss']
})
export class DocumentPreviewComponent implements OnInit, OnDestroy {
  @Input() document!: ClinicalDocument;
  @Input() dependentId!: string;
  @Output() closed = new EventEmitter<void>();

  accessLogs: DocumentAccessLog[] = [];
  isLoadingLogs = false;
  filePreviewUrl: string | null = null;
  isLoadingPreview = false;

  private destroy$ = new Subject<void>();

  constructor(
    private clinicalDocumentService: ClinicalDocumentService,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.loadAccessLogs();
    this.loadFilePreview();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadAccessLogs(): void {
    this.isLoadingLogs = true;
    this.clinicalDocumentService
      .getAccessLog(this.dependentId, this.document.id!)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (logs) => {
          this.accessLogs = logs;
          this.isLoadingLogs = false;
        },
        error: () => {
          this.isLoadingLogs = false;
        }
      });
  }

  private loadFilePreview(): void {
    if (!this.isImageFile()) {
      return;
    }

    this.isLoadingPreview = true;
    this.clinicalDocumentService
      .downloadDocument(this.document.storagePath)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (downloadUrl) => {
          this.filePreviewUrl = downloadUrl;
          this.isLoadingPreview = false;
        },
        error: () => {
          this.isLoadingPreview = false;
        }
      });
  }

  isImageFile(): boolean {
    return this.document.fileType.startsWith('image/');
  }

  isPdfFile(): boolean {
    return this.document.fileType === 'application/pdf';
  }

  downloadFile(): void {
    this.clinicalDocumentService
      .downloadDocument(this.document.storagePath)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (downloadUrl) => {
          const link = window.document.createElement('a');
          link.href = downloadUrl;
          link.download = this.document.fileName;
          link.click();
        },
        error: () => {
          this.notificationService.notifyError('Error', 'No se pudo descargar el archivo');
        }
      });
  }

  getFileIcon(): string {
    if (this.document.fileType.startsWith('image/')) return '/assets/icons/radiografia-osea.png';
    if (this.document.fileType === 'application/pdf') return '/assets/icons/certificado.png';
    if (this.document.fileType.includes('word')) return '/assets/icons/notas-medicas.png';
    return '/assets/icons/certificado.png';
  }

  getDocumentTypeLabel(): string {
    return DOCUMENT_TYPE_LABELS[this.document.documentType as keyof typeof DOCUMENT_TYPE_LABELS] ||
      this.document.documentType;
  }

  getAccessActionLabel(action: string): string {
    const labels: { [key: string]: string } = {
      view: 'Visualizado',
      download: 'Descargado',
      share: 'Compartido'
    };
    return labels[action] || action;
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
