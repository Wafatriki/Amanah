import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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
   * Subir una imagen (método público con validaciones)
   */
  async uploadImage(file: File): Promise<UploadResponse> {
    const validation = this.validateImage(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Archivo inválido');
    }

    return new Promise<UploadResponse>((resolve, reject) => {
      const reader = new FileReader();
      const timeoutMs = 15000;

      const cleanup = (): void => {
        clearTimeout(timeoutId);
        reader.onload = null;
        reader.onerror = null;
        reader.onabort = null;
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error('La lectura de la imagen tardó demasiado. Intenta con otra imagen.'));
      }, timeoutMs);

      reader.onload = () => {
        cleanup();
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) {
          reject(new Error('No se pudo procesar la imagen seleccionada'));
          return;
        }

        resolve({
          fileId: dataUrl,
          originalName: file.name,
          size: file.size,
          mimetype: file.type,
          downloadUrl: dataUrl,
        });
      };

      reader.onerror = () => {
        cleanup();
        reject(new Error('No se pudo leer la imagen'));
      };

      reader.onabort = () => {
        cleanup();
        reject(new Error('La lectura de la imagen fue cancelada'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Obtener URL para ver la imagen
   */
  getImageUrl(fileId: string): string {
    return fileId.startsWith('http') ? fileId : fileId;
  }

  /**
   * Eliminar una imagen almacenada localmente. No requiere acción remota.
   */
  deleteImage(fileId: string): Observable<{ success: boolean; message: string }> {
    return new Observable(observer => {
      observer.next({ success: true, message: 'Imagen eliminada correctamente' });
      observer.complete();
    });
  }
}
