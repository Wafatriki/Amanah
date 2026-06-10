import { Injectable, inject } from '@angular/core';
import { FirebaseService } from './firebase.service';
import { PermissionService } from './permission.service';
import { NotificationService } from './notification.service';
import { Task, TaskAssignment, RecurrenceConfig } from '../models/task.model';
import { getAuth } from 'firebase/auth';
import {
  collection,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  updateDoc,
  Timestamp,
  QueryConstraint,
  onSnapshot,
  deleteField,
} from 'firebase/firestore';
import { Observable, from } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class TaskService {
  private readonly tasksCollectionName = 'tasks';
  private readonly permissionService = inject(PermissionService);
  private readonly notificationService = inject(NotificationService);

  constructor(private readonly firebaseService: FirebaseService) {}

  private convertTimestamps(task: any): Task {
    if (task.dueDate instanceof Timestamp) {
      task.dueDate = task.dueDate.toDate();
    }
    if (task.createdAt instanceof Timestamp) {
      task.createdAt = task.createdAt.toDate();
    }
    if (task.updatedAt instanceof Timestamp) {
      task.updatedAt = task.updatedAt.toDate();
    }
    if (task.completedAt instanceof Timestamp) {
      task.completedAt = task.completedAt.toDate();
    }
    return task as Task;
  }

  async createTask(task: Task, userId: string): Promise<string> {
    console.log('[TASK-SERVICE] createTask called with:', { task, userId });

    // Validar permisos: Solo cuidadores pueden crear tareas
    if (!this.permissionService.canCreateTask()) {
      console.error('[TASK-SERVICE] Permission denied: canCreateTask() returned false');
      throw new Error('No tienes permisos para crear tareas');
    }

    if (!task.dependentId) {
      console.error('[TASK-SERVICE] Missing dependentId');
      throw new Error('Task must have a dependentId');
    }

    try {
      // Preparar datos ANTES de crear la referencia a la colección
      // ✅ FIX: Si no hay assignedTo, asignar al usuario que crea la tarea
      const assignedTo = task.assignedTo && Array.isArray(task.assignedTo) && task.assignedTo.length > 0
        ? task.assignedTo
        : [userId]; // Asignar al creador si está vacío

      const taskData: Record<string, any> = {
        title: task.title,
        description: task.description || '',
        dueDate: Timestamp.fromDate(new Date(task.dueDate)),
        dueTime: task.dueTime || '',
        priority: task.priority,
        status: task.status,
        dependentId: task.dependentId,
        assignedTo: assignedTo,
        notes: task.notes || '',
        createdBy: userId,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        completedAt: null,
        completedBy: null,
        recurrence: task.recurrence ? {
          frequency: task.recurrence.frequency,
          endsAfterDays: task.recurrence.endsAfterDays || null,
          endDate: task.recurrence.endDate ? Timestamp.fromDate(task.recurrence.endDate) : null,
          daysOfWeek: task.recurrence.daysOfWeek || [],
        } : {
          frequency: 'never',
          endsAfterDays: null,
          endDate: null,
          daysOfWeek: [],
        },
        isRotatingTask: task.isRotatingTask || false,
        rotationDays: task.rotationDays || 0,
        lastAssignedTo: task.lastAssignedTo || null,
        recurrenceExceptions: task.recurrenceExceptions || [],
        reminder: task.reminder ? {
          enabled: task.reminder.enabled || false,
          minutesBefore: task.reminder.minutesBefore || 60
        } : {
          enabled: false,
          minutesBefore: 60
        },
      };

      const firestorePath = `dependents/${task.dependentId}/tasks`;
      console.log('[TASK-SERVICE] Saving task to Firestore path:', firestorePath);
      console.log('[TASK-SERVICE] Task data to save:', taskData);
      // Guardar en la subcollection del dependiente
      const tasksCollection = collection(
        this.firebaseService.firestore,
        firestorePath
      );

      const docRef = await addDoc(tasksCollection, taskData);
      console.log('[TASK-SERVICE] ✅ Task created successfully with ID:', docRef.id);
      console.log('[TASK-SERVICE] ✅ Full path:', `dependents/${task.dependentId}/tasks/${docRef.id}`);
      console.log('[TASK-SERVICE] Collection reference:', tasksCollection);
      console.log('[TASK-SERVICE] Firestore instance:', this.firebaseService.firestore);

      // NOTA: No enviamos notificación aquí. Las notificaciones se envían solo en los recordatorios programados (X minutos antes)
      // basado en las preferencias del usuario (minutesBefore en las opciones de reminder)
      this.notificationService.notifyNewTask(task.title, new Date(task.dueDate).toLocaleDateString('es-ES'), userId);

      return docRef.id;
    } catch (error: any) {
      console.error('[TASK-SERVICE] ❌ Error creating task:', error);
      console.error('[TASK-SERVICE] Error code:', error.code);
      console.error('[TASK-SERVICE] Error message:', error.message);
      console.error('[TASK-SERVICE] Full error:', JSON.stringify(error, null, 2));
      throw error;
    }
  }

  async updateTask(id: string, task: Partial<Task>, dependentId?: string): Promise<void> {
    // Validar permisos: Solo cuidadores pueden editar tareas
    if (!this.permissionService.canEditTask()) {
      throw new Error('No tienes permisos para editar tareas');
    }

    try {
      // Si no tenemos dependentId, buscar la tarea primero (fallback)
      let taskRef;
      if (dependentId) {
        taskRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/tasks`, id);
      } else {
        // Fallback: buscar en colección global (para tareas antiguas)
        taskRef = doc(this.firebaseService.firestore, this.tasksCollectionName, id);
      }

      const updateData: Record<string, any> = {
        updatedAt: Timestamp.now(),
      };

      // Solo incluir campos que fueron explícitamente pasados
      if (task.title !== undefined) updateData['title'] = task.title;
      if (task.description !== undefined) updateData['description'] = task.description;
      if (task.priority !== undefined) updateData['priority'] = task.priority;
      if (task.status !== undefined) updateData['status'] = task.status;
      if (task.assignedTo !== undefined) updateData['assignedTo'] = task.assignedTo;
      if (task.notes !== undefined) updateData['notes'] = task.notes;
      if (task.dueTime !== undefined) updateData['dueTime'] = task.dueTime;
      if (task.recurrence !== undefined) updateData['recurrence'] = task.recurrence;
      if (task.recurrenceExceptions !== undefined) updateData['recurrenceExceptions'] = task.recurrenceExceptions;
      if (task.reminder !== undefined) updateData['reminder'] = task.reminder;

      // Convertir dueDate a Timestamp solo si está presente
      if (task.dueDate) {
        updateData['dueDate'] = Timestamp.fromDate(new Date(task.dueDate));
      }

      // Filtrar campos undefined (Firestore no permite undefined)
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await updateDoc(taskRef, updateData);
      if (dependentId) {
        await updateDoc(doc(this.firebaseService.firestore, this.tasksCollectionName, id), updateData).catch(() => {});
      }

      // Recuperar la tarea actualizada para enviar notificación con datos correctos
      try {
        const updatedTaskDoc = await getDoc(taskRef);
        if (updatedTaskDoc.exists()) {
          const updatedTask = this.convertTimestamps(updatedTaskDoc.data());
          const taskTitle = updatedTask.title || task.title || 'Tarea';
          const dueDateStr = updatedTask.dueDate
            ? new Date(updatedTask.dueDate).toLocaleDateString('es-ES')
            : 'Sin fecha';
          // Pasar el userId de quien hizo el cambio para no notificarlo
          this.notificationService.notifyTaskUpdated(taskTitle, dueDateStr, 'se actualizó', getAuth().currentUser?.uid);
        }
      } catch (notificationError) {
        console.error('Error sending notification:', notificationError);
        // No fallar la operación por error en la notificación
      }
    } catch (error) {
      console.error('Error updating task:', error);
      throw error;
    }
  }

  async deleteTask(id: string, dependentId?: string): Promise<void> {
    // Validar permisos: Solo cuidadores pueden eliminar tareas
    if (!this.permissionService.canDeleteTask()) {
      throw new Error('No tienes permisos para eliminar tareas');
    }

    try {
      let taskRef;
      if (dependentId) {
        taskRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/tasks`, id);
      } else {
        taskRef = doc(this.firebaseService.firestore, this.tasksCollectionName, id);
      }
      await deleteDoc(taskRef);
    } catch (error) {
      console.error('Error deleting task:', error);
      throw error;
    }
  }

  async getTask(id: string, dependentId?: string): Promise<Task | null> {
    try {
      const taskRefs = dependentId
        ? [
            doc(this.firebaseService.firestore, `dependents/${dependentId}/tasks`, id),
            doc(this.firebaseService.firestore, this.tasksCollectionName, id),
          ]
        : [doc(this.firebaseService.firestore, this.tasksCollectionName, id)];

      for (const taskRef of taskRefs) {
        const taskSnap = await getDoc(taskRef);
        if (!taskSnap.exists()) {
          continue;
        }

        const data = taskSnap.data();
        return this.convertTimestamps({
          id: taskSnap.id,
          dependentId: dependentId || data['dependentId'],
          ...data,
        });
      }

      return null;
    } catch (error) {
      console.error('Error getting task:', error);
      throw error;
    }
  }

  getTasksByDependentLive(dependentId: string): Observable<Task[]> {
    return new Observable((observer) => {
      // Usar la subcollection del dependiente
      const tasksCollection = collection(
        this.firebaseService.firestore,
        `dependents/${dependentId}/tasks`
      );
      // No necesitamos filtrar por dependentId en la query, ya que estamos dentro de la subcollection

      try {
        const unsubscribe = onSnapshot(
          tasksCollection,
          (snapshot) => {
            const tasks: Task[] = [];
            snapshot.forEach((doc) => {
              tasks.push(
                this.convertTimestamps({
                  id: doc.id,
                  dependentId,
                  ...doc.data(),
                })
              );
            });
            observer.next(tasks);
          },
          (error) => {
            console.error('Error listening to tasks:', error);
            observer.error(error);
          }
        );

        return () => unsubscribe();
      } catch (error) {
        console.error('Error in getTasksByDependentLive:', error);
        observer.error(error);
        return () => {};
      }
    });
  }

  getTasksAssignedToUser(userId: string): Observable<Task[]> {
    return new Observable((observer) => {
      const tasksCollection = collection(this.firebaseService.firestore, this.tasksCollectionName);
      // Firestore no permite queries en arrays fácilmente, así que obtenemos todas y filtramos
      const q = query(tasksCollection, where('status', '!=', 'completed'));

      try {
        const unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const tasks: Task[] = [];
            snapshot.forEach((doc) => {
              const task = this.convertTimestamps({
                id: doc.id,
                ...doc.data(),
              });
              // Filtrar las que están asignadas al usuario
              if (task.assignedTo && task.assignedTo.some((a: any) => a.userId === userId)) {
                tasks.push(task);
              }
            });
            observer.next(tasks);
          },
          (error) => {
            console.error('Error listening to assigned tasks:', error);
            observer.error(error);
          }
        );

        return () => unsubscribe();
      } catch (error) {
        console.error('Error in getTasksAssignedToUser:', error);
        observer.error(error);
        return () => {};
      }
    });
  }

  async completeTask(
    taskId: string,
    userId: string,
    timestamp?: Date,
    dependentId?: string
  ): Promise<void> {
    try {
      let taskRef;
      if (dependentId) {
        taskRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/tasks`, taskId);
      } else {
        taskRef = doc(this.firebaseService.firestore, this.tasksCollectionName, taskId);
      }
      const taskDoc = await getDoc(taskRef);

      if (taskDoc.exists()) {
        const task = taskDoc.data() as Task;

        // Actualizar tarea como completada
        await updateDoc(taskRef, {
          status: 'completed',
          completedAt: Timestamp.fromDate(timestamp || new Date()),
          completedBy: userId,
          updatedAt: Timestamp.now(),
        });
        if (dependentId) {
          await updateDoc(doc(this.firebaseService.firestore, this.tasksCollectionName, taskId), {
            status: 'completed',
            completedAt: Timestamp.fromDate(timestamp || new Date()),
            completedBy: userId,
            updatedAt: Timestamp.now(),
          }).catch(() => {});
        }

        // Enviar notificación de tarea completada
        const dueDate = task.dueDate instanceof Date
          ? task.dueDate.toLocaleDateString('es-ES')
          : new Date(task.dueDate).toLocaleDateString('es-ES');
        this.notificationService.notifyTaskCompleted(task.title, dueDate);
      }
    } catch (error) {
      console.error('Error completing task:', error);
      throw error;
    }
  }

  async toggleTaskStatus(
    taskId: string,
    userId: string,
    dependentId?: string
  ): Promise<void> {
    try {
      let taskRef;
      if (dependentId) {
        taskRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/tasks`, taskId);
      } else {
        taskRef = doc(this.firebaseService.firestore, this.tasksCollectionName, taskId);
      }
      const taskDoc = await getDoc(taskRef);

      if (!taskDoc.exists()) {
        throw new Error('Task not found');
      }

      const task = taskDoc.data() as Task;
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';

      const updateData: any = {
        status: newStatus,
        updatedAt: Timestamp.now(),
      };

      if (newStatus === 'pending') {
        updateData.completedAt = deleteField();
        updateData.completedBy = deleteField();
      }

      await updateDoc(taskRef, updateData);
      if (dependentId) {
        await updateDoc(doc(this.firebaseService.firestore, this.tasksCollectionName, taskId), updateData).catch(() => {});
      }
    } catch (error) {
      console.error('Error toggling task status:', error);
      throw error;
    }
  }

  async setTaskStatus(
    taskId: string,
    newStatus: 'completed' | 'pending' | 'overdue',
    userId: string,
    completedInstances?: string[],
    dependentId?: string
  ): Promise<void> {
    try {
      let taskRef;
      if (dependentId) {
        taskRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/tasks`, taskId);
      } else {
        taskRef = doc(this.firebaseService.firestore, this.tasksCollectionName, taskId);
      }

      const updateData: any = {
        status: newStatus,
        updatedAt: Timestamp.now(),
      };

      if (completedInstances !== undefined) {
        updateData.completedInstances = completedInstances;
      }

      if (newStatus === 'pending') {
        // Remove completion fields when reverting to pending
        updateData.completedAt = deleteField();
        updateData.completedBy = deleteField();
      } else if (newStatus === 'completed') {
        updateData.completedAt = Timestamp.now();
        updateData.completedBy = userId;
      }

      await updateDoc(taskRef, updateData);
      if (dependentId) {
        await updateDoc(doc(this.firebaseService.firestore, this.tasksCollectionName, taskId), updateData).catch(() => {});
      }
    } catch (error) {
      console.error('Error setting task status:', error);
      throw error;
    }
  }

  async assignTaskToUsers(taskId: string, userIds: string[], dependentId?: string): Promise<void> {
    try {
      let taskRef;
      if (dependentId) {
        taskRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/tasks`, taskId);
      } else {
        taskRef = doc(this.firebaseService.firestore, this.tasksCollectionName, taskId);
      }
      await updateDoc(taskRef, {
        assignedTo: userIds,
        updatedAt: Timestamp.now(),
      });
      if (dependentId) {
        await updateDoc(doc(this.firebaseService.firestore, this.tasksCollectionName, taskId), {
          assignedTo: userIds,
          updatedAt: Timestamp.now(),
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Error assigning task:', error);
      throw error;
    }
  }

  // Sistema de turnos rotatorios
  async rotateTaskAssignment(
    taskId: string,
    caregivers: any[],
    userId: string,
    dependentId?: string
  ): Promise<void> {
    try {
      const task = await this.getTask(taskId, dependentId);
      if (!task || !caregivers.length) return;

      // Encontrar el siguiente cuidador
      const currentIndex = caregivers.findIndex(
        (c) => c.userId === task.lastAssignedTo
      );
      const nextIndex = (currentIndex + 1) % caregivers.length;
      const nextCaregiverId = caregivers[nextIndex].userId;

      let taskRef;
      if (dependentId) {
        taskRef = doc(this.firebaseService.firestore, `dependents/${dependentId}/tasks`, taskId);
      } else {
        taskRef = doc(this.firebaseService.firestore, this.tasksCollectionName, taskId);
      }
      await updateDoc(taskRef, {
        assignedTo: [nextCaregiverId],
        lastAssignedTo: nextCaregiverId,
        updatedAt: Timestamp.now(),
      });
      if (dependentId) {
        await updateDoc(doc(this.firebaseService.firestore, this.tasksCollectionName, taskId), {
          assignedTo: [nextCaregiverId],
          lastAssignedTo: nextCaregiverId,
          updatedAt: Timestamp.now(),
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Error rotating task assignment:', error);
      throw error;
    }
  }

  // Obtener tareas pendientes por cuidador
  async getTasksByCaregiver(
    userId: string,
    dependentId: string
  ): Promise<Task[]> {
    try {
      const tasksCollection = collection(
        this.firebaseService.firestore,
        `dependents/${dependentId}/tasks`
      );
      const q = query(
        tasksCollection,
        where('status', '==', 'pending')
      );

      const querySnapshot = await getDocs(q);
      const tasks: Task[] = [];

      querySnapshot.forEach((doc) => {
        const task = this.convertTimestamps({
          id: doc.id,
          ...doc.data(),
        });
        // Filtrar las asignadas al usuario
        if (task.assignedTo && task.assignedTo.some((a: any) => a.userId === userId)) {
          tasks.push(task);
        }
      });

      return tasks;
    } catch (error) {
      console.error('Error getting caregiver tasks:', error);
      return [];
    }
  }

  // Verificar y actualizar tareas vencidas
  async updateOverdueTasks(dependentId: string): Promise<void> {
    try {
      const tasks = await this.getTasksByDependentLive(dependentId).toPromise();
      if (!tasks) return;

      const now = new Date();
      for (const task of tasks) {
        if (
          task.status === 'pending' &&
          new Date(task.dueDate) < now
        ) {
          await this.updateTask(task.id!, { status: 'overdue' }, dependentId);
        }
      }
    } catch (error) {
      console.error('Error updating overdue tasks:', error);
    }
  }
}
