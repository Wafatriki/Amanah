import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { PermissionService } from '../../services/permission.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DocumentUploadComponent } from '../document-upload/document-upload.component';
import { DocumentListComponent } from '../document-list/document-list.component';

@Component({
  selector: 'app-document-management',
  standalone: true,
  imports: [CommonModule, DocumentUploadComponent, DocumentListComponent],
  templateUrl: './document-management.component.html',
  styleUrls: ['./document-management.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DocumentManagementComponent implements OnInit, OnDestroy {
  activeDependentId: string | null = null;
  showUploadForm = false;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly activeDependentService: ActiveDependentService,
    private readonly permissionService: PermissionService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.activeDependentService.activeDependentId$
      .pipe(takeUntil(this.destroy$))
      .subscribe((id: string | null) => {
        this.activeDependentId = id;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleUploadForm(): void {
    this.showUploadForm = !this.showUploadForm;
    this.cdr.markForCheck();
  }

  onDocumentUploaded(): void {
    this.showUploadForm = false;
    // Forzar re-renderizado del hijo
    this.cdr.markForCheck();
    // Esperar a que Angular complete el ciclo y marcar de nuevo
    Promise.resolve().then(() => this.cdr.markForCheck());
  }

  onUploadCancelled(): void {
    this.showUploadForm = false;
    this.cdr.markForCheck();
  }

  canUploadDocument(): boolean {
    return this.permissionService.canUploadDocument();
  }
}
