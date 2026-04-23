import { Injectable } from '@angular/core';
import { initializeApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class FirebaseService {
  public readonly app = initializeApp(environment.firebase);
  public auth: Auth = getAuth(this.app);
  public firestore: Firestore = getFirestore(this.app);
  public storage = getStorage(this.app);

  constructor() {
    // Persistir sesión en localStorage para no perder login al recargar.
    setPersistence(this.auth, browserLocalPersistence).catch((error) => {
      console.warn('No se pudo configurar la persistencia local de Auth:', error);
    });

    console.log('Firebase initialized');
    console.log(`Environment: ${environment.production ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    
    // En desarrollo, usar emuladores solo si se solicita explícitamente con ?firebase=emulator
    if (!environment.production && this.shouldUseEmulators()) {
      this.connectToEmulators();
    } else if (!environment.production) {
      console.log('Usando Firebase real (Auth/Firestore/Functions). Para emuladores usa ?firebase=emulator');
    }
  }

  private shouldUseEmulators(): boolean {
    try {
      const params = new URLSearchParams(globalThis.location?.search ?? '');
      return params.get('firebase') === 'emulator';
    } catch {
      return false;
    }
  }

  private connectToEmulators(): void {
    try {
      // Conectar Auth Emulator
      connectAuthEmulator(this.auth, 'http://localhost:9099', { disableWarnings: true });
      console.log('✓ Auth Emulator connected');
    } catch (error) {
      console.log('Auth Emulator already connected or unavailable');
      console.debug(error);
    }

    try {
      // Conectar Firestore Emulator
      connectFirestoreEmulator(this.firestore, 'localhost', 8080);
      console.log('✓ Firestore Emulator connected');
    } catch (error) {
      console.log('Firestore Emulator already connected or unavailable');
      console.debug(error);
    }

    try {
      // Conectar Functions Emulator
      const functions = getFunctions(this.app);
      connectFunctionsEmulator(functions, 'localhost', 5001);
      console.log('✓ Functions Emulator connected');
    } catch (error) {
      console.log('Functions Emulator already connected or unavailable');
      console.debug(error);
    }
  }
}
