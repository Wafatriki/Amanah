import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DependentService } from '../../services/dependent.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { Dependent } from '../../models/dependent.model';

@Component({
  selector: 'app-create-dependent',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-dependent.component.html',
  styleUrls: ['./create-dependent.component.scss']
})






export class CreateDependentComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  error: string | null = null;
  imagePreview: string | null = null;
  isUploadingImage = false;

  constructor(
    private readonly fb: FormBuilder,
    private readonly dependentService: DependentService,
    private readonly imageUploadService: ImageUploadService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  initializeForm(): void {
    this.form = this.fb.group({
      name: ['', [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(50),
        Validators.pattern(/^[a-záéíóúñ\s]*$/i)  // Solo letras y espacios
      ]],
      age: ['', [
        Validators.required,
        Validators.min(0),
        Validators.max(150),
        Validators.pattern(/^\d+$/)
      ]],
      medicalConditions: ['', [
        Validators.pattern(/^[a-záéíóúñ,\s]*$/i)
      ]]
    });
  }

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (file) {
      // Mostrar preview local mientras se sube
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
      };
      reader.readAsDataURL(file);

      // Subir la imagen al backend
      this.uploadImage(file);
    }
  }

  private async uploadImage(file: File): Promise<void> {
    this.isUploadingImage = true;
    this.error = null;

    try {
      const response = await this.imageUploadService.uploadImage(file);

      // Guardar la URL de la imagen en el formulario
      const imageUrl = this.imageUploadService.getImageUrl(response.fileId);
      this.form.patchValue({ image: imageUrl });

      this.isUploadingImage = false;
    } catch (err) {
      console.error('Error uploading image:', err);
      this.error = err instanceof Error ? err.message : 'Error al subir la imagen';
      this.isUploadingImage = false;
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      const currentUser = this.authService.getCurrentUser();
      if (!currentUser) {
        throw new Error('No hay usuario autenticado');
      }

      const formValue = this.form.value;
      const newDependent: Omit<Dependent, 'id' | 'createdAt' | 'createdBy'> = {
        name: formValue.name,
        age: Number.parseInt(formValue.age, 10),
        medicalConditions: formValue.medicalConditions ? formValue.medicalConditions.split(',').map((c: string) => c.trim()) : [],
        image: formValue.image || ''
      };

      await this.dependentService.createDependent(newDependent as Omit<Dependent, 'id'>, currentUser.uid);

      // Obtener el ID del nuevo dependiente y establecerlo como activo
      this.dependentService.getDependentsForUser(currentUser.uid).subscribe({
        next: (dependents) => {
          if (dependents.length > 0) {
            // El último dependiente es el que acabamos de crear
            const newDependentId = dependents[dependents.length - 1].id;
            this.activeDependentService.setActiveDependentId(newDependentId);
            // El creador del dependiente es siempre primary_caregiver
            this.activeDependentService.setActiveDependentRole('primary_caregiver');
            this.router.navigate(['/dashboard']);
          } else {
            this.router.navigate(['/dependent-selector']);
          }
        },
        error: () => {
          this.router.navigate(['/dependent-selector']);
        }
      });
    } catch (err) {
      console.error('Error creating dependent:', err);
      this.error = 'Error al crear el dependiente. Por favor intenta de nuevo.';
      this.loading = false;
    }
  }

  cancel(): void {
    this.router.navigate(['/dependent-selector']);
  }






  //ERRORES
  getNameError(): string {
    const control = this.form.get('name');
    if (!control) return '';
    if (control.hasError('required'))
      return 'El nombre es requerido';
    if (control.hasError('minlength')) return 'Mínimo 2 caracteres';
    if (control.hasError('maxLength')) return 'Máximo 50 caracteres';
    if (control.hasError('pattern')) return 'Solo letras y espacios';
    return '';
  }

  getAgeError(): string {
    const control = this.form.get('age');
    if (!control) return '';
    if (control.hasError('required')) return 'La edad es requerida';
    if (control.hasError('pattern')) return 'La edad debe ser un número';
    return '';
  }

  getMedicalConditionsError(): string {
    const control = this.form.get('medicalConditions');
    if (!control) return '';
    if (control.hasError('pattern')) return 'Formato inválido (separa por comas)';

    return '';
}


}
