import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { Router } from '@angular/router';
import { User } from '../../models/user.model';
import { Subject } from 'rxjs';
import { getAuth, updateProfile, reload } from 'firebase/auth';

@Component({
  selector: 'app-edit-caregiver-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-caregiver-profile.component.html',
  styleUrl: './edit-caregiver-profile.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EditCaregiverProfileComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  loading = true;
  error: string | null = null;
  imagePreview: string | null = null;
  isUploadingImage = false;
  uploadProgress = 0;
  private destroy$ = new Subject<void>();

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly imageUploadService: ImageUploadService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    this.loadCaregiverProfile();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  initializeForm(): void {
    this.form = this.fb.group({
      name: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        Validators.pattern(/^[a-záéíóúñ\s]*$/i)
      ]],
      email: [{ value: '', disabled: true }, [
        Validators.required,
        Validators.email
      ]],
      phone: ['', [
        Validators.pattern(/^[\d\s\-\+\(\)]*$/)
      ]],
      image: ['']
    });
  }

  loadCaregiverProfile(): void {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user || !user.uid) {
      this.error = 'Usuario no autenticado';
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.authService.getUserData(user.uid).subscribe({
      next: (userData: User | null) => {
        this.loading = false;
        if (userData) {
          this.form.patchValue({
            name: userData.name,
            email: userData.email,
            phone: (userData as any).phone || ''
          });
          if ((userData as any).image) {
            this.imagePreview = (userData as any).image;
          }
          this.cdr.markForCheck();
        } else {
          this.error = 'No se encontraron los datos del perfil';
          this.cdr.markForCheck();
        }
      },
      error: (err: any) => {
        console.error('Error loading caregiver profile:', err);
        this.error = 'Error cargando el perfil';
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  onFileSelected(event: any): void {
    const fileInput = event.target as HTMLInputElement;
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      const file = fileInput.files[0];

      // Mostrar preview local mientras se sube
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);

      // Subir la imagen al backend
      this.uploadImage(file);
    }
  }

  private async uploadImage(file: File): Promise<void> {
    this.isUploadingImage = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      const response = await this.imageUploadService.uploadImage(file);

      // Guardar la URL de la imagen en el formulario
      const imageUrl = this.imageUploadService.getImageUrl(response.fileId);
      this.form.patchValue({ image: imageUrl });

      this.isUploadingImage = false;
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Error uploading image:', err);
      this.error = err instanceof Error ? err.message : 'Error al subir la imagen';
      this.isUploadingImage = false;
      this.cdr.markForCheck();
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error = 'Por favor completa todos los campos requeridos correctamente';
      this.cdr.markForCheck();
      return;
    }

    if (this.isUploadingImage) {
      this.error = 'Por favor espera a que la imagen termine de subirse';
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user || !user.uid) {
        this.error = 'Usuario no autenticado';
        this.loading = false;
        this.cdr.markForCheck();
        return;
      }

      const formValue = this.form.value;

      // Usar la URL de la imagen (que apunta al backend) o mantener la existente
      const photoURL = formValue.image && !formValue.image.startsWith('data:')
        ? formValue.image
        : user.photoURL;

      // Actualizar perfil de Firebase Auth
      await updateProfile(user, {
        displayName: formValue.name,
        photoURL: photoURL
      });

      // Actualizar documento en Firestore
      await this.authService.updateUserProfile(user.uid, {
        fullName: formValue.name,
        phoneNumber: formValue.phone,
        image: formValue.image || user.photoURL || ''
      });

      // Recargar usuario para sincronizar cambios
      await reload(user);

      this.router.navigate(['/profile']);
    } catch (err) {
      console.error('Error updating profile:', err);
      this.error = 'Error al actualizar el perfil. Por favor intenta de nuevo.';
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  cancel(): void {
    this.router.navigate(['/profile']);
  }

  getNameError(): string {
    const control = this.form.get('name');
    if (!control) return '';
    if (control.hasError('required')) return 'El nombre es requerido';
    if (control.hasError('minlength')) return 'Mínimo 2 caracteres';
    if (control.hasError('maxlength')) return 'Máximo 50 caracteres';
    if (control.hasError('pattern')) return 'Solo letras y espacios';
    return '';
  }

  getEmailError(): string {
    const control = this.form.get('email');
    if (!control) return '';
    if (control.hasError('required')) return 'El email es requerido';
    if (control.hasError('email')) return 'Email inválido';
    return '';
  }

  getPhoneError(): string {
    const control = this.form.get('phone');
    if (!control) return '';
    if (control.hasError('pattern')) return 'Formato de teléfono inválido';
    return '';
  }
}
