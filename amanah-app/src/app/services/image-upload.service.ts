import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export interface UploadResponse {
  fileId: string;
  originalName: string;
  size: number;
  mimetype: string;
  downloadUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImageUploadService {
  private readonly BACKEND_URL = environment.backendUrl || 'http://localhost:3000';
  private uploadQueue$ = new Subject<{
    file: File;
    resolve: (value: UploadResponse) => void;
    reject: (reason?: any) => void;
  }>();

  private isUploading = false;

  constructor(private readonly http: HttpClient) {
    // Procesar cola de subidas secuencialmente
    this.setupUploadQueue();
  }

  private setupUploadQueue(): void {
    let queue: Array<{
      file: File;
      resolve: (value: UploadResponse) => void;
      reject: (reason?: any) => void;
    }> = [];

    this.uploadQueue$.subscribe(item => {
      queue.push(item);
      this.processQueue(queue);
    });
  }

  private async processQueue(queue: Array<{
    file: File;
    resolve: (value: UploadResponse) => void;
    reject: (reason?: any) => void;
  }>): Promise<void> {
    if (this.isUploading || queue.length === 0) {
      return;
    }

    this.isUploading = true;
    const item = queue.shift();

    if (item) {
      try {
        const response = await this.uploadImageToBackend(item.file).toPromise();
        if (response) {
          item.resolve(response);
        }
      } catch (error) {
        item.reject(error);
      }
    }

    this.isUploading = false;

    // Procesar siguiente item en la cola
    if (queue.length > 0) {
      this.processQueue(queue);
    }
  }

  /**
   * Validar que el archivo es una imagen válida
   */
  private validateImage(file: File): { valid: boolean; error?: string } {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedMimes.includes(file.type)) {
      return { valid: false, error: 'Solo se permiten imágenes JPG y PNG' };
    }

    if (file.size > maxSize) {
      return { valid: false, error: 'La imagen no debe exceder 5MB' };
    }

    return { valid: true };
  }

  /**
   * Subir una imagen al backend
   */
  private uploadImageToBackend(file: File): Observable<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<UploadResponse>(`${this.BACKEND_URL}/upload`, formData);
  }

  /**
   * Subir una imagen (método público con validaciones)
   */
  uploadImage(file: File): Promise<UploadResponse> {
    return new Promise((resolve, reject) => {
      // Validar
      const validation = this.validateImage(file);
      if (!validation.valid) {
        reject(new Error(validation.error || 'Archivo inválido'));
        return;
      }

      // Añadir a la cola de subidas
      this.uploadQueue$.next({ file, resolve, reject });
    });
  }

  /**
   * Obtener URL para ver la imagen
   */
  getImageUrl(fileId: string): string {
    return `${this.BACKEND_URL}/file/${fileId}`;
  }

  /**
   * Eliminar una imagen del backend
   */
  deleteImage(fileId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${this.BACKEND_URL}/delete/${fileId}`
    );
  }
}
