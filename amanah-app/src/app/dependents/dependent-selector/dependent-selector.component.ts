import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DependentService } from '../../services/dependent.service';
import { ActiveDependentService } from '../../services/active-dependent.service';
import { Dependent } from '../../models/dependent.model';

@Component({
  selector: 'app-dependent-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dependent-selector.component.html',
  styleUrls: ['./dependent-selector.component.scss']
})
export class DependentSelectorComponent implements OnInit {
  readonly emojiAvatarDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="58" text-anchor="middle" dominant-baseline="middle" font-size="56">👤</text></svg>'
  )}`;
  dependents: Dependent[] = [];
  filteredDependents: Dependent[] = [];
  loading = true;
  error: string | null = null;
  currentUserId: string | null = null;
  caregiversByDependent: Map<string, any[]> = new Map();
  searchQuery = '';

  constructor(
    private readonly dependentService: DependentService,
    private readonly activeDependentService: ActiveDependentService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadDependents();
  }

  loadDependents(): void {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.error = 'No hay usuario autenticado';
      this.loading = false;
      return;
    }

    this.currentUserId = currentUser.uid;
    console.log('Loading dependents for user:', currentUser.uid);

    this.dependentService.getDependentsForUser(currentUser.uid).subscribe({
      next: (dependents: Dependent[]) => {
        console.log('Dependents loaded from service:', dependents);
        this.dependents = dependents;
        this.filteredDependents = dependents;

        if (dependents.length === 0) {
          console.log('No dependents found for user');
          this.loading = false;
          this.cdr.markForCheck();
          return;
        }

        // Cargar cuidadores para cada dependiente
        const caregiverPromises = dependents.map(dependent =>
          this.dependentService.getCaregiversForDependent(dependent.id)
            .then(caregivers => {
              console.log('Caregivers for dependent', dependent.id, ':', caregivers);
              this.caregiversByDependent.set(dependent.id, caregivers);
            })
        );

        Promise.all(caregiverPromises)
          .then(() => {
            this.loading = false;
            this.cdr.markForCheck();
          })
          .catch((error) => {
            console.error('Error loading caregivers:', error);
            this.loading = false;
            this.cdr.markForCheck();
          });
      },
      error: (err) => {
        console.error('Error loading dependents:', err);
        this.error = 'Error cargando dependientes';
        this.loading = false;
        this.cdr.markForCheck();
      }
    });
  }

  selectDependent(dependent: Dependent): void {
    this.activeDependentService.setActiveDependentId(dependent.id);

    // Obtener el rol del usuario para este dependiente
    const caregivers = this.caregiversByDependent.get(dependent.id) || [];
    const userCaregiver = caregivers.find(c => c.userId === this.currentUserId);

    if (userCaregiver) {
      this.activeDependentService.setActiveDependentRole(
        userCaregiver.role as 'primary_caregiver' | 'collaborative_caregiver' | 'invited'
      );
      console.log('User role for dependent:', userCaregiver.role);
    }

    this.router.navigate(['/dashboard']);
  }

  isPrimaryCaregiver(dependentId: string): boolean {
    const caregivers = this.caregiversByDependent.get(dependentId) || [];
    return caregivers.some(c => c.userId === this.currentUserId && c.role === 'primary_caregiver');
  }

  openCreateForm(): void {
    this.router.navigate(['/create-dependent']);
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }

  onSearchChange(query: string): void {
    this.searchQuery = query.toLowerCase();
    this.filteredDependents = this.dependents.filter(dependent =>
      dependent.name.toLowerCase().includes(this.searchQuery)
    );
    this.cdr.markForCheck();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filteredDependents = this.dependents;
    this.cdr.markForCheck();
  }

  replaceWithEmojiAvatar(event: Event): void {
    const target = event.target as HTMLImageElement | null;
    if (!target) {
      return;
    }

    target.onerror = null;
    target.src = this.emojiAvatarDataUrl;
  }
}

