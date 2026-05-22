import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DependentService } from '../../services/dependent.service';
import { AuthService } from '../../services/auth.service';
import { ActivatedRoute, Router } from '@angular/router';
import { Dependent } from '../../models/dependent.model';
import { MedicationService } from '../../services/medication.service';
import { Medication } from '../../models/medication.model';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-edit-dependent',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-dependent.component.html',
  styleUrl: './edit-dependent.component.scss',
})
export class EditDependentComponent implements OnInit, OnDestroy {
  form!: FormGroup;
  dependentId: string | null= null;
  loading = true;
  error: string | null =null;
  imagePreview: string | null = null;
  isUploadingImage = false;
  medications: Medication[] = [];
  private destroy$ = new Subject<void>();



  constructor(
    private readonly fb: FormBuilder,
    private readonly dependentService: DependentService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly medicationService: MedicationService
  ) {}

  ngOnInit(): void {
    this.dependentId = this.route.snapshot.paramMap.get('id');
    if (!this.dependentId) {
      this.error = 'ID de dependiente no válido';
      return;
    }

    this.initializeForm();
    this.verifyOwnershipAndLoad();
    this.loadMedications();
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
      age: ['', [
        Validators.required,
        Validators.pattern(/^\d+$/),
        Validators.min(0),
        Validators.max(150)
      ]],
      medicalConditions: ['', [
        Validators.pattern(/^[a-záéíóúñ,\s]*$/i)
      ]],
      image: ['']
    });
  }

  async verifyOwnershipAndLoad(): Promise<void> {
    if (!this.dependentId) return;

    try {
      // Verify that the current user is the owner of this dependent
      const dependent = await this.dependentService.getDependent(this.dependentId).toPromise();

      if (!dependent) {
        console.warn('Dependent not found');
        this.error = 'Dependiente no encontrado';
        this.loading = false;
        return;
      }

      const currentUser = this.authService.getCurrentUser();
      // Check if the current user is the owner (createdBy field)
      if (dependent.createdBy !== currentUser?.uid) {
        console.warn('User is not the owner of this dependent. Redirecting to dashboard.');
        this.error = 'No tienes permiso para editar este dependiente';
        setTimeout(() => {
          this.router.navigate(['/dashboard']);
        }, 1500);
        return;
      }

      this.loadDependentData();
    } catch (error) {
      console.error('Error verifying ownership:', error);
      this.error = 'Error al verificar permiso';
      this.loading = false;
    }
  }

  loadDependentData(): void {
    if (!this.dependentId) return;

    this.dependentService.getDependent(this.dependentId).subscribe({
      next: (dependent: Dependent | null) => {
        this.loading = false;
        if (dependent) {
          this.form.patchValue({
            name: dependent.name,
            age: dependent.age,
            medicalConditions: dependent.medicalConditions.join(', ')
          });
          if (dependent.image) {
            this.imagePreview = dependent.image;
          }
        } else {
          this.error = 'Dependiente no encontrado';
        }
      },
      error: (err: any) => {
        console.error('Error loading dependent:', err);
        this.error = 'Error cargando el dependiente';
        this.loading = false;
      }
    });
  }

  loadMedications(): void {
    if (!this.dependentId) return;

    this.medicationService.getMedicationsByDependent(this.dependentId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (medications: Medication[]) => {
          this.medications = medications;
        },
        error: (err: any) => {
          console.error('Error loading medications:', err);
        }
      });
  }

  async onFileSelected(event: any): Promise<void> {
    const file = event.target.files[0];
    if (!file) {
      return;
    }

    this.isUploadingImage = true;
    this.error = null;

    try {
      const imageUrl = await this.convertFileToDataUrl(file);
      this.imagePreview = imageUrl;
      this.form.patchValue({ image: imageUrl });
    } catch (error: any) {
      this.error = error?.message || 'Error al procesar la imagen';
      console.error('Upload error:', error);
    } finally {
      this.isUploadingImage = false;
    }
  }

  private validateImage(file: File): void {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg'];
    const maxSize = 5 * 1024 * 1024;

    if (!allowedMimes.includes(file.type)) {
      throw new Error('Solo se permiten imágenes JPG y PNG');
    }

    if (file.size > maxSize) {
      throw new Error('La imagen no debe exceder 5MB');
    }
  }

  private convertFileToDataUrl(file: File): Promise<string> {
    this.validateImage(file);

    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      const timeoutId = setTimeout(() => {
        reader.abort();
        reject(new Error('La lectura de la imagen tardó demasiado. Prueba otra foto.'));
      }, 15000);

      const cleanup = (): void => {
        clearTimeout(timeoutId);
        reader.onload = null;
        reader.onerror = null;
        reader.onabort = null;
      };

      reader.onload = () => {
        cleanup();
        const dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) {
          reject(new Error('No se pudo procesar la imagen seleccionada'));
          return;
        }
        resolve(dataUrl);
      };

      reader.onerror = () => {
        cleanup();
        reject(new Error('No se pudo leer la imagen seleccionada'));
      };

      reader.onabort = () => {
        cleanup();
        reject(new Error('La lectura de la imagen fue cancelada'));
      };

      reader.readAsDataURL(file);
    });
  }

  async submit(): Promise<void> {
    if (this.isUploadingImage) {
      return;
    }

    if (this.form.invalid || !this.dependentId) {
      this.error = 'Por favor completa todos los campos requeridos';
      return;
    }

    this.loading= true;
    this.error = null;

    try {
      const formValue = this.form.value;
      const updatedDependent: Partial<Dependent> = {
        name: formValue.name,
        age: Number.parseInt(formValue.age, 10),
        medicalConditions: formValue.medicalConditions ? formValue.medicalConditions.split(',').map((c: string) => c.trim()) : [],
        image: formValue.image
      };

      await this.dependentService.updateDependent(this.dependentId, updatedDependent);
      this.router.navigate(['/dashboard']);
    } catch (err) {
      console.error('Error updating dependent:', err);
      this.error = 'Error al actualizar el dependiente. Por favor intenta de nuevo.';
      this.loading = false;
    }
  }




  cancel(): void {
    this.router.navigate(['/dashboard']);
  }

  getNameError(): string {
    const control = this.form.get('name');
    if (!control) return '';
    if (control.hasError('required')) return 'El nombre es requerido';
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

  goToMedications(): void {
    if (this.dependentId) {
      this.router.navigate(['/medications'], { queryParams: { dependentId: this.dependentId } });
    }
  }

}
