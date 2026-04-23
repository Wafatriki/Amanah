import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { PermissionService } from './permission.service';
import { NotificationService } from './notification.service';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  arrayUnion
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Observable, from } from 'rxjs';
import { Medication, MedicationObservation, MedicationIntake } from '../models/medication.model';

@Injectable({
  providedIn: 'root'
})
export class MedicationService {
  private readonly permissionService = inject(PermissionService);
  private readonly notificationService = inject(NotificationService);

  constructor(private readonly firebaseService: FirebaseService) { }

  /**
   * Obtener todas las medicaciones de un dependiente
   */
  getMedicationsByDependent(dependentId: string): Observable<Medication[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/medications`),
        orderBy('startDate', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const medications: Medication[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            medications.push({
              id: doc.id,
              ...this.convertFirestoreToMedication(data)
            } as Medication);
          });
          observer.next(medications);
        },
        error => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  /**
   * Obtener medicaciones activas de un dependiente
   */
  getActiveMedications(dependentId: string): Observable<Medication[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/medications`),
        where('isActive', '==', true),
        orderBy('startDate', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const medications: Medication[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            medications.push({
              id: doc.id,
              ...this.convertFirestoreToMedication(data)
            } as Medication);
          });
          observer.next(medications);
        },
        error => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  /**
   * Crear una nueva medicación
   */
  createMedication(dependentId: string, medication: Medication): Observable<string> {
    // Validar permisos: Solo cuidadores pueden crear medicamentos
    if (!this.permissionService.canCreateMedication()) {
      return from(Promise.reject(new Error('No tienes permisos para crear medicamentos')));
    }

    return from(
      addDoc(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/medications`),
        this.convertMedicationToFirestore(medication)
      ).then(docRef => {
        // Enviar notificación de nueva medicación
        const dose = medication.dose || '';
        const nextSchedule = medication.schedules && medication.schedules.length > 0
          ? medication.schedules[0].time
          : '';
        this.notificationService.notifyMedication(medication.name, dose, nextSchedule);
        return docRef.id;
      })
    );
  }

  /**
   * Actualizar una medicación
   */
  updateMedication(dependentId: string, medicationId: string, medication: Partial<Medication>): Observable<void> {
    // Validar permisos: Solo cuidadores pueden editar medicamentos
    if (!this.permissionService.canEditMedication()) {
      return from(Promise.reject(new Error('No tienes permisos para editar medicamentos')));
    }

    return from(
      updateDoc(
        doc(this.firebaseService.firestore, `dependents/${dependentId}/medications/${medicationId}`),
        this.convertMedicationToFirestore(medication as Medication)
      ).then(async () => {
        // Recuperar la medicación actualizada de la BD para enviar notificación con datos correctos
        try {
          const medicationRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/medications/${medicationId}`);
          const medicationDoc = await getDoc(medicationRef);
          if (medicationDoc.exists()) {
            const updatedMedication = medicationDoc.data() as Medication;
            const dose = updatedMedication.dose || '';
            const nextSchedule = updatedMedication.schedules && updatedMedication.schedules.length > 0
              ? updatedMedication.schedules[0].time
              : '';
            // Pasar el userId de quien hizo el cambio para no notificarlo
            const auth = getAuth();
            this.notificationService.notifyMedicationUpdated(updatedMedication.name, dose, nextSchedule, 'se actualizó', auth.currentUser?.uid);
          }
        } catch (notificationError) {
          console.error('Error sending medication notification:', notificationError);
          // No fallar la operación por error en la notificación
        }
      })
    );
  }

  /**
   * Eliminar una medicación
   */
  deleteMedication(dependentId: string, medicationId: string): Observable<void> {
    // Validar permisos: Solo cuidadores pueden eliminar medicamentos
    if (!this.permissionService.canDeleteMedication()) {
      return from(Promise.reject(new Error('No tienes permisos para eliminar medicamentos')));
    }

    return from(
      deleteDoc(doc(this.firebaseService.firestore, `dependents/${dependentId}/medications/${medicationId}`))
    );
  }

  /**
   * Marcar una dosis como completada
   */
  markScheduleCompleted(
    dependentId: string,
    medicationId: string,
    scheduleIndex: number
  ): Observable<void> {
    const medicationRef = doc(
      this.firebaseService.firestore,
      `dependents/${dependentId}/medications/${medicationId}`
    );

    return from(
      (async () => {
        // Leer el documento completo
        const docSnapshot = await getDoc(medicationRef);
        if (!docSnapshot.exists()) {
          throw new Error('Medicación no encontrada');
        }

        const medicationData = docSnapshot.data();
        const schedules = Array.isArray(medicationData['schedules'])
          ? medicationData['schedules']
          : Object.values(medicationData['schedules'] || {});

        // Guardar la fecha de hoy en formato YYYY-MM-DD
        const today = new Date();
        const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Actualizar el schedule en el array
        if (schedules[scheduleIndex]) {
          schedules[scheduleIndex].completed = true;
          schedules[scheduleIndex].completedAt = Timestamp.now();
          schedules[scheduleIndex].lastCompletedDate = todayString;

          // Agregar a historial de completaciones
          if (!schedules[scheduleIndex].completionHistory) {
            schedules[scheduleIndex].completionHistory = [];
          }
          if (!schedules[scheduleIndex].completionHistory.includes(todayString)) {
            schedules[scheduleIndex].completionHistory.push(todayString);
          }
        }

        // Update completion history in Firestore
        await updateDoc(medicationRef, {
          schedules: schedules,
          updatedAt: Timestamp.now()
        });

        // Enviar notificación de medicación tomada
        const medicationName = medicationData['name'] || 'Medicación';
        const dose = medicationData['dose'] || '';
        const scheduleTime = schedules[scheduleIndex]?.time || '';
        this.notificationService.notifyMedicationTaken(medicationName, dose, scheduleTime);
      })()
    );
  }

  /**
   * Marcar una dosis como no completada
   */
  markScheduleIncomplete(
    dependentId: string,
    medicationId: string,
    scheduleIndex: number
  ): Observable<void> {
    const medicationRef = doc(
      this.firebaseService.firestore,
      `dependents/${dependentId}/medications/${medicationId}`
    );

    return from(
      (async () => {
        // Leer el documento completo
        const docSnapshot = await getDoc(medicationRef);
        if (!docSnapshot.exists()) {
          throw new Error('Medicación no encontrada');
        }

        const medicationData = docSnapshot.data();
        const schedules = Array.isArray(medicationData['schedules'])
          ? medicationData['schedules']
          : Object.values(medicationData['schedules'] || {});

        // Actualizar el schedule en el array
        if (schedules[scheduleIndex]) {
          schedules[scheduleIndex].completed = false;
          schedules[scheduleIndex].completedAt = null;
          schedules[scheduleIndex].lastCompletedDate = null;
        }

        // Persist updated schedules to Firestore
        await updateDoc(medicationRef, {
          schedules: schedules,
          updatedAt: Timestamp.now()
        });
      })()
    );
  }

  /**
   * Agregar una observación a una medicación
   */
  addObservation(
    dependentId: string,
    medicationId: string,
    observation: MedicationObservation
  ): Observable<void> {
    const medicationRef = doc(
      this.firebaseService.firestore,
      `dependents/${dependentId}/medications/${medicationId}`
    );

    return from(
      updateDoc(medicationRef, {
        observations: arrayUnion({
          date: Timestamp.fromDate(observation.date),
          text: observation.text,
          userId: observation.userId,
          userName: observation.userName
        })
      })
    );
  }

  /**
   * Obtener todas las tomas de medicación para hoy de un dependiente
   */
  getTodaysMedicationIntakes(dependentId: string): Observable<MedicationIntake[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/medications`),
        where('isActive', '==', true)
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const intakes: MedicationIntake[] = [];
          const today = new Date();
          today.setHours(0, 0, 0, 0); // Inicio del día

          snapshot.forEach(doc => {
            const medication = this.convertFirestoreToMedication(doc.data()) as Medication;
            medication.id = doc.id;

            // Verificar que la medicación sea válida para hoy
            const startDate = new Date(medication.startDate);
            startDate.setHours(0, 0, 0, 0);

            // Verificar si la medicación ya ha comenzado
            if (startDate > today) {
              return; // Medicación aún no ha comenzado
            }

            // Verificar si la medicación ha terminado
            if (medication.endDate) {
              const endDate = new Date(medication.endDate);
              endDate.setHours(0, 0, 0, 0);
              if (endDate < today) {
                return; // Medicación ya ha terminado
              }
            }

            // Crear una toma por cada horario (solo si la medicación es válida para hoy)
            medication.schedules.forEach((schedule, index) => {
              // Calcular si está completado HOY
              const today = new Date();
              const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              const isCompletedToday = schedule.lastCompletedDate === todayString;

              intakes.push({
                medicationId: medication.id!,
                medicationName: medication.name,
                scheduleTime: schedule.time,
                scheduleIndex: index,
                date: today,
                completed: isCompletedToday,
                completedAt: schedule.completedAt
              });
            });
          });

          // Ordenar por hora
          intakes.sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime));
          observer.next(intakes);
        },
        error => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  /**
   * Obtener el historial de medicación para una rango de fechas
   * Usa completionHistory si está disponible, sino fallback a lastCompletedDate
   */
  getMedicationHistory(
    dependentId: string,
    medicationId: string,
    startDate: Date,
    endDate: Date
  ): Observable<any[]> {
    return new Observable(observer => {
      const unsubscribe = onSnapshot(
        doc(this.firebaseService.firestore, `dependents/${dependentId}/medications/${medicationId}`),
        snapshot => {
          if (snapshot.exists()) {
            const medicationData = snapshot.data();
            const medication = {
              id: snapshot.id,
              ...this.convertFirestoreToMedication(medicationData)
            } as Medication;

            // Primero intentar usar el campo history si existe
            if (medication.history && medication.history.length > 0) {
              const filteredHistory = medication.history.filter(entry => {
                const entryDate = new Date(entry.date);
                entryDate.setHours(0, 0, 0, 0);
                return entryDate >= startDate && entryDate <= endDate;
              });
              observer.next(filteredHistory);
              return;
            }

            // Construir historial desde los schedules usando completionHistory
            const historyMap = new Map<string, any>();
            const normalizeDate = (dateStr: string) => {
              const [year, month, day] = dateStr.split('-').map(Number);
              const date = new Date(year, month - 1, day);
              date.setHours(0, 0, 0, 0);
              return date;
            };

            // Normalizar las fechas de inicio y fin para comparación
            const normalizedStartDate = new Date(startDate);
            normalizedStartDate.setHours(0, 0, 0, 0);
            const normalizedEndDate = new Date(endDate);
            normalizedEndDate.setHours(23, 59, 59, 999);

            medication.schedules.forEach(schedule => {
              // Usar completionHistory si está disponible (array de fechas)
              const datesToCheck = schedule.completionHistory || (schedule.lastCompletedDate ? [schedule.lastCompletedDate] : []);

              datesToCheck.forEach((dateStr: string) => {
                const scheduleDate = normalizeDate(dateStr);

                // Filtrar por rango de fechas
                if (scheduleDate >= normalizedStartDate && scheduleDate <= normalizedEndDate) {
                  if (!historyMap.has(dateStr)) {
                    historyMap.set(dateStr, {
                      date: scheduleDate,
                      schedules: []
                    });
                  }

                  const existing = historyMap.get(dateStr)!.schedules.find((s: any) => s.time === schedule.time && s.dosage === schedule.dosage);
                  if (!existing) {
                    historyMap.get(dateStr)!.schedules.push({
                      time: schedule.time,
                      dosage: schedule.dosage,
                      completed: true,
                      completedAt: schedule.completedAt,
                      notes: schedule.notes
                    });
                  }
                }
              });
            });

            const history = Array.from(historyMap.values()).sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );
            observer.next(history);
          } else {
            observer.error(new Error('Medicación no encontrada'));
          }
        },
        error => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  /**
   * Cambiar estado activo/inactivo de una medicación
   */
  toggleMedicationActive(
    dependentId: string,
    medicationId: string,
    isActive: boolean
  ): Observable<void> {
    return from(
      updateDoc(
        doc(this.firebaseService.firestore, `dependents/${dependentId}/medications/${medicationId}`),
        { isActive }
      )
    );
  }

  /**
   * Convertir Firestore data a objeto Medication
   */
  private convertFirestoreToMedication(data: any): Partial<Medication> {
    // Convertir schedules de objeto a array si es necesario
    const schedulesData = Array.isArray(data.schedules) ? data.schedules : Object.values(data.schedules || {});
    const observationsData = Array.isArray(data.observations) ? data.observations : Object.values(data.observations || {});

    return {
      dependentId: data.dependentId,
      name: data.name,
      dose: data.dose,
      presentation: data.presentation,
      activeIngredient: data.activeIngredient,
      schedules: schedulesData.map((schedule: any) => ({
        time: schedule.time,
        dosage: schedule.dosage,
        notes: schedule.notes,
        completed: schedule.completed || false,
        completedAt: schedule.completedAt?.toDate(),
        lastCompletedDate: schedule.lastCompletedDate,
        completionHistory: schedule.completionHistory || [],
        reminder: schedule.reminder || { enabled: false, minutesBefore: 15 }
      })),
      indication: data.indication,
      startDate: data.startDate?.toDate() || new Date(),
      endDate: data.endDate?.toDate(),
      isActive: data.isActive || true,
      prescribedBy: data.prescribedBy,
      observations: observationsData.map((obs: any) => ({
        date: obs.date?.toDate() || new Date(),
        text: obs.text,
        userId: obs.userId,
        userName: obs.userName
      })),
      history: data.history || [],
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      createdBy: data.createdBy
    };
  }

  /**
   * Convertir objeto Medication a Firestore format
   */
  private convertMedicationToFirestore(medication: Medication | Partial<Medication>): any {
    const now = Timestamp.now();

    return {
      dependentId: medication.dependentId,
      name: medication.name,
      dose: medication.dose,
      presentation: medication.presentation,
      activeIngredient: medication.activeIngredient,
      schedules: (medication.schedules || []).map(schedule => ({
        time: schedule.time,
        dosage: schedule.dosage,
        notes: schedule.notes,
        completed: schedule.completed || false,
        completedAt: schedule.completedAt ? Timestamp.fromDate(schedule.completedAt) : null,
        lastCompletedDate: schedule.lastCompletedDate || null,
        completionHistory: schedule.completionHistory || [],
        reminder: schedule.reminder ? {
          enabled: schedule.reminder.enabled || false,
          minutesBefore: schedule.reminder.minutesBefore || 30
        } : {
          enabled: false,
          minutesBefore: 30
        }
      })),
      indication: medication.indication,
      startDate: medication.startDate ? Timestamp.fromDate(medication.startDate) : Timestamp.now(),
      endDate: medication.endDate ? Timestamp.fromDate(medication.endDate) : null,
      isActive: medication.isActive ?? true,
      prescribedBy: medication.prescribedBy,
      observations: (medication.observations || []).map(obs => ({
        date: obs.date instanceof Date ? Timestamp.fromDate(obs.date) : obs.date,
        text: obs.text,
        userId: obs.userId,
        userName: obs.userName
      })),
      history: medication.history || [],
      createdAt: medication.createdAt ? Timestamp.fromDate(medication.createdAt) : now,
      updatedAt: now,
      createdBy: medication.createdBy
    };
  }
}
