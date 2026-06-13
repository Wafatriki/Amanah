import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { getAuth } from 'firebase/auth';

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
  private readonly backendUrl = environment.backendUrl || 'http://localhost:3000';

  constructor() {}

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
   * Subir una imagen al backend usando fetch
   */
  async uploadImage(file: File): Promise<UploadResponse> {
    const validation = this.validateImage(file);
    if (!validation.valid) {
      throw new Error(validation.error || 'Archivo inválido');
    }

    try {
      // Obtener el token de autenticación
      const auth = getAuth();
      if (!auth.currentUser) {
        throw new Error('Usuario no autenticado');
      }

      const token = await auth.currentUser.getIdToken();

      const formData = new FormData();
      formData.append('file', file);

      console.log('Uploading to:', `${this.backendUrl}/upload`);

      const response = await fetch(`${this.backendUrl}/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${token}`
        }
        // NO incluir Content-Type header - fetch lo hará automáticamente
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}: ${response.statusText}`);
      }

      const data: UploadResponse = await response.json();
      console.log('Upload successful:', data);
      return data;
    } catch (error: any) {
      console.error('Error uploading image:', error);
      throw new Error(error.message || 'No se pudo subir la imagen. Intenta de nuevo.');
    }
  }

  /**
   * Obtener URL para ver la imagen
   */
  getImageUrl(fileId: string): string {
    return fileId.startsWith('http')
      ? fileId
      : `${this.backendUrl}/file/${fileId}`;
  }

  /**
   * Eliminar una imagen del backend
   */
  async deleteImage(fileId: string): Promise<{ success: boolean; message: string }> {
    try {
      // Obtener el token de autenticación
      const auth = getAuth();
      if (!auth.currentUser) {
        throw new Error('Usuario no autenticado');
      }

      const token = await auth.currentUser.getIdToken();

      const response = await fetch(`${this.backendUrl}/delete/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error deleting image:', error);
      throw new Error(error.message || 'No se pudo eliminar la imagen');
    }
  }
}
