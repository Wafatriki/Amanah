import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ActiveDependentService {
  private readonly activeDependentIdSubject = new BehaviorSubject<string | null>(
    this.getStoredDependentId()
  );

  private readonly activeDependentRoleSubject = new BehaviorSubject<'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null>(
    this.getStoredDependentRole()
  );

  public activeDependentId$ = this.activeDependentIdSubject.asObservable();
  public activeDependentRole$ = this.activeDependentRoleSubject.asObservable();

  constructor() {}

  // Guardar el ID del dependiente activo
  setActiveDependentId(id: string): void {
    localStorage.setItem('activeDependentId', id);
    this.activeDependentIdSubject.next(id);
  }

  // Guardar el rol del dependiente activo
  setActiveDependentRole(role: 'primary_caregiver' | 'collaborative_caregiver' | 'invited'): void {
    localStorage.setItem('activeDependentRole', role);
    this.activeDependentRoleSubject.next(role);
  }

  // Obtener el ID del dependiente activo
  getActiveDependentId(): string | null {
    return this.activeDependentIdSubject.value;
  }

  // Obtener el rol del dependiente activo
  getActiveDependentRole(): 'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null {
    return this.activeDependentRoleSubject.value;
  }

  // Observable para suscribirse a cambios
  getActiveDependentId$(): Observable<string | null> {
    return this.activeDependentId$;
  }

  // Observable para suscribirse a cambios de rol
  getActiveDependentRole$(): Observable<'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null> {
    return this.activeDependentRole$;
  }

  // Limpiar el dependiente activo
  clearActiveDependentId(): void {
    localStorage.removeItem('activeDependentId');
    localStorage.removeItem('activeDependentRole');
    this.activeDependentIdSubject.next(null);
    this.activeDependentRoleSubject.next(null);
  }

  // Obtener el ID guardado en localStorage
  private getStoredDependentId(): string | null {
    if (typeof globalThis.window !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
      return globalThis.localStorage.getItem('activeDependentId');
    }
    return null;
  }

  // Obtener el rol guardado en localStorage
  private getStoredDependentRole(): 'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null {
    if (typeof globalThis.window !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
      const role = globalThis.localStorage.getItem('activeDependentRole');
      return role as 'primary_caregiver' | 'collaborative_caregiver' | 'invited' | null;
    }
    return null;
  }
}
