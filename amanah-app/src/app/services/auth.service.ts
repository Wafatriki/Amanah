import { Injectable } from '@angular/core';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User, sendPasswordResetEmail, sendEmailVerification, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth';
import { FirebaseService } from './firebase.service';
import { BehaviorSubject, Observable, from, map } from 'rxjs';
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private readonly firebaseService: FirebaseService) {
    this.initializeAuthState();
  }

  private initializeAuthState(): void {
    onAuthStateChanged(this.firebaseService.auth, (user) => {
      this.currentUserSubject.next(user);
    });
  }

  /**
   * Validates password strength
   * Requirements: 8+ chars, uppercase, lowercase, number, special char
   */
  validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Mínimo 8 caracteres');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Al menos una mayúscula');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Al menos una minúscula');
    }
    if (!/\d/.test(password)) {
      errors.push('Al menos un número');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password)) {
      errors.push('Al menos un carácter especial (!@#$%^&*...)');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Calculate password strength percentage (0-100)
   */
  calculatePasswordStrength(password: string): number {
    let strength = 0;
    if (password.length >= 8) strength += 20;
    if (password.length >= 12) strength += 10;
    if (/[a-z]/.test(password)) strength += 15;
    if (/[A-Z]/.test(password)) strength += 15;
    if (/\d/.test(password)) strength += 20;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/.test(password)) strength += 20;
    return Math.min(strength, 100);
  }

  async register(email: string, password: string, fullName: string): Promise<any> {
    const credentials = await createUserWithEmailAndPassword(this.firebaseService.auth, email, password);
    console.log('User created in Auth:', credentials.user.uid);

    // Enviar email de verificación
    try {
      await sendEmailVerification(credentials.user);
      console.log('Verification email sent');
    } catch (err) {
      console.warn('Could not send verification email:', err);
    }

    // Guardar datos del usuario en Firestore
    try {
      const userDocRef = doc(this.firebaseService.firestore, 'users', credentials.user.uid);
      await setDoc(userDocRef, {
        role: 'primary_caregiver',
        email: email,
        fullName: fullName,
        createdAt: new Date(),
        emailVerified: false
      });
      console.log('User document saved in Firestore:', credentials.user.uid);
    } catch (err) {
      console.error('Error saving user document:', err);
      throw new Error(`No se pudo guardar el perfil de usuario: ${err}`);
    }

    return credentials;
  }

  login(email: string, password: string): Promise<any> {
    return signInWithEmailAndPassword(this.firebaseService.auth, email, password);
  }

  logout(): Promise<void> {
    return signOut(this.firebaseService.auth);
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  async getCurrentUserFullName(): Promise<string> {
    const user = this.getCurrentUser();
    if (!user) return 'Usuario desconocido';

    try {
      const userDoc = await getDoc(doc(this.firebaseService.firestore, 'users', user.uid));
      return userDoc.data()?.['fullName'] || user.email || 'Usuario';
    } catch (err) {
      console.error('Error obteniendo nombre completo:', err);
      return user.email || 'Usuario';
    }
  }

  async getUserFullName(userId: string): Promise<string> {
    try {
      const userDoc = await getDoc(doc(this.firebaseService.firestore, 'users', userId));
      return userDoc.data()?.['fullName'] || 'Usuario';
    } catch (err) {
      console.error('Error obteniendo nombre del usuario:', err);
      return 'Usuario';
    }
  }

  sendPasswordReset(email: string): Promise<void> {
    return sendPasswordResetEmail(this.firebaseService.auth, email);
  }

  getUserData(uid: string): Observable<any> {
    return from(getDoc(doc(this.firebaseService.firestore, 'users', uid))).pipe(
      map(docSnap => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          // Map Firestore field names to expected format
          return {
            uid: uid,
            userId: uid,
            email: data['email'],
            name: data['fullName'] || data['name'],
            role: data['role'],
            createdAt: data['createdAt'],
            phone: data['phoneNumber'] || data['phone'],
            image: data['image'],
            specialization: data['specialization']
          };
        }
        return null;
      })
    );
  }

  async updateUserProfile(uid: string, updates: Partial<any>): Promise<void> {
    const userDocRef = doc(this.firebaseService.firestore, 'users', uid);
    await updateDoc(userDocRef, updates);
  }

  /**
   * Cambiar la contraseña del usuario actual
   * Requiere autenticación
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user?.email) {
      throw new Error('No hay usuario autenticado');
    }

    try {
      // Reautenticar con la contraseña actual
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Cambiar a la nueva contraseña
      await updatePassword(user, newPassword);
    } catch (error: any) {
      if (error.code === 'auth/wrong-password') {
        throw new Error('Contraseña actual incorrecta');
      } else if (error.code === 'auth/weak-password') {
        throw new Error('La nueva contraseña es muy débil');
      } else {
        throw new Error('Error al cambiar la contraseña: ' + error.message);
      }
    }
  }

  /**
   * Eliminar la cuenta del usuario
   * Requiere reautenticación
   * Nota: Los datos de Firestore se mantienen para auditoría
   */
  async deleteAccount(password: string): Promise<void> {
    const user = this.getCurrentUser();
    if (!user?.email) {
      throw new Error('No hay usuario autenticado');
    }

    try {
      // Reautenticar con la contraseña actual
      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      // Intentar eliminar documento del usuario de Firestore (puede fallar por permisos)
      const userDocRef = doc(this.firebaseService.firestore, 'users', user.uid);
      try {
        await deleteDoc(userDocRef);
      } catch (firestoreError: any) {
        console.warn('No se pudo eliminar documento de Firestore:', firestoreError.message);
        // Continuar con la eliminación de la cuenta de Firebase aunque falle el documento
      }

      // Eliminar la cuenta de Firebase (esta es la operación crítica)
      await deleteUser(user);
    } catch (error: any) {
      if (error.code === 'auth/wrong-password') {
        throw new Error('Contraseña incorrecta');
      } else if (error.code === 'auth/invalid-credential') {
        throw new Error('Credenciales inválidas. Verifica tu email y contraseña');
      } else if (error.code === 'auth/user-token-expired') {
        throw new Error('Tu sesión ha expirado. Por favor vuelve a iniciar sesión');
      } else {
        throw new Error('Error al eliminar la cuenta: ' + error.message);
      }
    }
  }
}
