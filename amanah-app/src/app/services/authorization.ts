import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';
import { FirebaseService } from './firebase.service';
import { doc, getDoc } from 'firebase/firestore';
import { UserRole } from '../models/user.model';

@Injectable({
  providedIn: 'root',
})
export class AuthorizationService {
  // Rol global de la cuenta. No debe cambiar al cambiar de dependiente.
  private globalUserRoleSubject = new BehaviorSubject<UserRole | null>(null);
  public globalUserRole$ = this.globalUserRoleSubject.asObservable();

  constructor(
    private readonly authService: AuthService,
    private readonly firebaseService: FirebaseService
  ) {
    this.initializeUserRole();
  }

  private initializeUserRole(): void {
    this.authService.currentUser$.subscribe(user => {
      if (user && user.uid) {
        this.loadUserRole(user.uid);
      } else {
        this.globalUserRoleSubject.next(null);
      }
    });
  }

  private async loadUserRole(uid: string): Promise<void> {
    try {
      const userDoc = await getDoc(doc(this.firebaseService.firestore, 'users', uid));
      if (userDoc.exists()) {
        const role = userDoc.data()['role'] as UserRole;
        console.log('User role loaded:', role);
        // Guardar solo como rol global de cuenta
        this.globalUserRoleSubject.next(role);
      } else {
        console.warn('User document does not exist:', uid);
        console.log('Creating user document with default role: primary_caregiver');
        
        // Crear documento de usuario con rol por defecto
        try {
          const { setDoc, doc } = await import('firebase/firestore');
          await setDoc(doc(this.firebaseService.firestore, 'users', uid), {
            role: 'primary_caregiver',
            email: this.authService.getCurrentUser()?.email || '',
            fullName: this.authService.getCurrentUser()?.displayName || 'Usuario',
            createdAt: new Date(),
            emailVerified: false
          });
          console.log('✅ User document created successfully');
          this.globalUserRoleSubject.next(UserRole.PRIMARY_CAREGIVER);
        } catch (createError) {
          console.error('Error creating user document:', createError);
          this.globalUserRoleSubject.next(null);
        }
      }
    } catch (error) {
      console.error('Error al cargar el rol de usuario:', error);
      this.globalUserRoleSubject.next(null);
    }
  }

  hasRole(role: UserRole): boolean {
    return this.globalUserRoleSubject.value === role;
  }

  hasAnyRole(roles: UserRole[]): boolean {
    const currentRole = this.globalUserRoleSubject.value;
    return currentRole ? roles.includes(currentRole) : false;
  }

  // Obtener el rol global del usuario (no el rol del dependiente actual)
  getGlobalRole(): UserRole | null {
    return this.globalUserRoleSubject.value;
  }

}
