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
  orderBy,
  onSnapshot,
  Timestamp,
  arrayUnion
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Observable, from } from 'rxjs';
import { Appointment, AppointmentNote } from '../models/appointment.model';

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private readonly permissionService = inject(PermissionService);
  private readonly notificationService = inject(NotificationService);

  constructor(private firebaseService: FirebaseService) { }

  /**
   * Obtener todas las citas de un dependiente
   */
  getAppointmentsByDependent(dependentId: string): Observable<Appointment[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/appointments`),
        orderBy('date', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const appointments: Appointment[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            appointments.push({
              id: doc.id,
              ...this.convertFirestoreToAppointment(data)
            } as Appointment);
          });
          observer.next(appointments);
        },
        error => observer.error(error)
      );

      return () => unsubscribe();
    });
  }

  /**
   * Obtener citas próximas (futuras)
   */
  getUpcomingAppointments(dependentId: string): Observable<Appointment[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/appointments`),
        orderBy('date', 'asc')
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const appointments: Appointment[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            const appointment = {
              id: doc.id,
              ...this.convertFirestoreToAppointment(data)
            } as Appointment;

            // Filter cliente-side: sólo citas futuras con status 'scheduled'
            const appointmentDate = new Date(appointment.date);
            appointmentDate.setHours(0, 0, 0, 0);
            if (appointmentDate >= today && appointment.status === 'scheduled') {
              appointments.push(appointment);
            }
          });
          observer.next(appointments);
        },
        error => {
          console.error('Error in getUpcomingAppointments:', error);
          observer.next([]);
        }
      );

      return () => unsubscribe();
    });
  }

  /**
   * Obtener historial de citas pasadas
   */
  getAppointmentHistory(dependentId: string): Observable<Appointment[]> {
    return new Observable(observer => {
      const q = query(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/appointments`),
        orderBy('date', 'desc')
      );

      const unsubscribe = onSnapshot(
        q,
        snapshot => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const appointments: Appointment[] = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            const appointment = {
              id: doc.id,
              ...this.convertFirestoreToAppointment(data)
            } as Appointment;

            // Filter cliente-side: sólo citas pasadas
            const appointmentDate = new Date(appointment.date);
            appointmentDate.setHours(0, 0, 0, 0);
            if (appointmentDate < today) {
              appointments.push(appointment);
            }
          });
          observer.next(appointments);
        },
        error => {
          console.error('Error in getAppointmentHistory:', error);
          observer.next([]);
        }
      );

      return () => unsubscribe();
    });
  }

  /**
   * Crear una nueva cita
   */
  createAppointment(dependentId: string, appointment: Appointment): Observable<string> {
    // Validar permisos: Solo cuidadores pueden crear citas
    if (!this.permissionService.canCreateAppointment()) {
      return from(Promise.reject(new Error('No tienes permisos para crear citas')));
    }

    return from(
      addDoc(
        collection(this.firebaseService.firestore, `dependents/${dependentId}/appointments`),
        this.convertAppointmentToFirestore(appointment)
      ).then(docRef => {
        // Enviar notificación de nueva cita
        const doctorName = appointment.doctor || 'Cita médica';
        const appointmentTime = appointment.time || '';
        const appointmentDateStr = appointment.date instanceof Date
          ? appointment.date.toLocaleDateString('es-ES')
          : new Date(appointment.date).toLocaleDateString('es-ES');
        this.notificationService.notifyUpcomingAppointment(doctorName, appointmentDateStr, appointmentTime);
        return docRef.id;
      })
    );
  }

  /**
   * Actualizar una cita existente
   */
  updateAppointment(dependentId: string, appointmentId: string, appointment: Partial<Appointment>): Observable<void> {
    // Validar permisos: Solo cuidadores pueden editar citas
    if (!this.permissionService.canEditAppointment()) {
      return from(Promise.reject(new Error('No tienes permisos para editar citas')));
    }

    return from(
      updateDoc(
        doc(this.firebaseService.firestore, `dependents/${dependentId}/appointments/${appointmentId}`),
        this.convertAppointmentToFirestore(appointment as Appointment)
      ).then(async () => {
        // Recuperar la cita actualizada de la BD para enviar notificación con datos correctos
        try {
          const appointmentRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/appointments/${appointmentId}`);
          const appointmentDoc = await getDoc(appointmentRef);
          if (appointmentDoc.exists()) {
            const updatedAppointment = appointmentDoc.data() as Appointment;
            const doctorName = updatedAppointment.doctor || 'Cita médica';
            const appointmentTime = updatedAppointment.time || '';
            const appointmentDateStr = updatedAppointment.date instanceof Date
              ? updatedAppointment.date.toLocaleDateString('es-ES')
              : new Date(updatedAppointment.date).toLocaleDateString('es-ES');
            // Pasar el userId de quien hizo el cambio para no notificarlo
            const auth = getAuth();
            this.notificationService.notifyAppointmentUpdated(doctorName, appointmentDateStr, appointmentTime, 'se actualizó', auth.currentUser?.uid);
          }
        } catch (notificationError) {
          console.error('Error sending appointment notification:', notificationError);
          // No fallar la operación por error en la notificación
        }
      })
    );
  }

  /**
   * Eliminar una cita
   */
  deleteAppointment(dependentId: string, appointmentId: string): Observable<void> {
    // Validar permisos: Solo cuidadores pueden eliminar citas
    if (!this.permissionService.canDeleteAppointment()) {
      return from(Promise.reject(new Error('No tienes permisos para eliminar citas')));
    }

    return from(
      deleteDoc(doc(this.firebaseService.firestore, `dependents/${dependentId}/appointments/${appointmentId}`))
    );
  }

  /**
   * Agregar nota post-cita
   */
  addPostAppointmentNote(
    dependentId: string,
    appointmentId: string,
    note: AppointmentNote
  ): Observable<void> {
    return from(
      updateDoc(
        doc(this.firebaseService.firestore, `dependents/${dependentId}/appointments/${appointmentId}`),
        {
          postAppointmentNotes: arrayUnion({
            date: Timestamp.fromDate(note.date),
            text: note.text,
            userId: note.userId,
            userName: note.userName
          })
        }
      )
    );
  }

  /**
   * Actualizar estado de la cita
   */
  updateAppointmentStatus(
    dependentId: string,
    appointmentId: string,
    status: 'scheduled' | 'overdue' | 'completed' | 'cancelled'
  ): Observable<void> {
    return from(
      (async () => {
        const appointmentRef = doc(
          this.firebaseService.firestore,
          `dependents/${dependentId}/appointments/${appointmentId}`
        );

        // Si se marca como completada, enviar notificación
        if (status === 'completed') {
          const appointmentDoc = await getDoc(appointmentRef);
          if (appointmentDoc.exists()) {
            const appointmentData = appointmentDoc.data();
            const doctorName = appointmentData['doctor'] || 'Cita médica';
            const appointmentTime = appointmentData['time'] || '';
            const appointmentDateStr = appointmentData['date'] instanceof Date
              ? appointmentData['date'].toLocaleDateString('es-ES')
              : new Date(appointmentData['date']).toLocaleDateString('es-ES');

            this.notificationService.notifyAppointmentCompleted(doctorName, appointmentDateStr, appointmentTime);
          }
        }

        await updateDoc(appointmentRef, { status });
      })()
    );
  }

  /**
   * Convertir datos de Firestore a objeto Appointment
   */
  private convertFirestoreToAppointment(data: any): Partial<Appointment> {
    return {
      dependentId: data.dependentId,
      date: data.date?.toDate ? data.date.toDate() : data.date,
      time: data.time,
      specialty: data.specialty,
      location: data.location,
      doctor: data.doctor || undefined,
      reason: data.reason || undefined,
      notes: data.notes || undefined,
      postAppointmentNotes: (data.postAppointmentNotes || []).map((note: any) => ({
        date: note.date?.toDate ? note.date.toDate() : note.date,
        text: note.text,
        userId: note.userId,
        userName: note.userName
      })),
      status: data.status || 'scheduled',
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : data.updatedAt,
      createdBy: data.createdBy,
      isLate: data.isLate || false,
      duration: data.duration || undefined,
      assignedCaregiverIds: data.assignedCaregiverIds || [],
      assignedCaregiverNames: data.assignedCaregiverNames || [],
      reminder: data.reminder || { enabled: false, minutesBefore: 60 }
    };
  }

  /**
   * Convertir objeto Appointment a formato Firestore
   */
  private convertAppointmentToFirestore(appointment: Appointment | Partial<Appointment>): any {
    const data: any = {};

    if (appointment.dependentId) data.dependentId = appointment.dependentId;
    if (appointment.date) data.date = Timestamp.fromDate(new Date(appointment.date));
    if (appointment.time) data.time = appointment.time;
    if (appointment.specialty) data.specialty = appointment.specialty;
    if (appointment.location) data.location = appointment.location;
    if (appointment.doctor) data.doctor = appointment.doctor;
    if (appointment.reason) data.reason = appointment.reason;
    if (appointment.notes) data.notes = appointment.notes;
    if (appointment.status) data.status = appointment.status;
    if (appointment.createdAt) data.createdAt = Timestamp.fromDate(new Date(appointment.createdAt));
    if (appointment.updatedAt) data.updatedAt = Timestamp.fromDate(new Date(appointment.updatedAt));
    if (appointment.createdBy) data.createdBy = appointment.createdBy;
    if (appointment.isLate !== undefined) data.isLate = appointment.isLate;
    if (appointment.duration) data.duration = appointment.duration;
    if (appointment.assignedCaregiverIds && appointment.assignedCaregiverIds.length > 0) data.assignedCaregiverIds = appointment.assignedCaregiverIds;
    if (appointment.assignedCaregiverNames && appointment.assignedCaregiverNames.length > 0) data.assignedCaregiverNames = appointment.assignedCaregiverNames;
    if (appointment.reminder) data.reminder = appointment.reminder;

    // postAppointmentNotes se maneja aparte con arrayUnion
    if (appointment.postAppointmentNotes && appointment.postAppointmentNotes.length > 0) {
      data.postAppointmentNotes = appointment.postAppointmentNotes.map(note => ({
        date: Timestamp.fromDate(new Date(note.date)),
        text: note.text,
        userId: note.userId,
        userName: note.userName
      }));
    }

    return data;
  }
}
