import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import * as path from 'node:path';
import { FieldValue } from 'firebase-admin/firestore';

// Cargar variables de entorno desde .env.local en desarrollo
if (process.env.NODE_ENV !== 'production') {
  const envFiles = [
    path.resolve(process.cwd(), '..', '.env.local'),
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(process.cwd(), '.env.local')
  ];

  for (const envFile of envFiles) {
    try {
      const result = require('dotenv').config({ path: envFile });
      if (!result.error && result.parsed?.GROQ_API_KEY) {
        console.log(`Loaded env file: ${envFile}`);
        break;
      }
    } catch {
      // Intentar con la siguiente ruta candidata
    }
  }
}

// Cloud Functions SIEMPRE usan Firestore Real (no emulator)
// Aunque el emulator de Functions esté corriendo en localhost:5001
// Esto asegura que la función lea datos de Firestore production
console.log('🔐 Configurando Cloud Functions para usar Firestore REAL...');
delete process.env.FIRESTORE_EMULATOR_HOST;

// Inicializar Firebase Admin
admin.initializeApp();
console.log('✅ Firebase Admin inicializado con Firestore REAL');

// Cloud Function que se ejecuta cuando se crea una invitación
export const sendInvitationEmail = functions.firestore
  .document('invitations/{docId}')
  .onCreate(async (snap: any, context: any) => {
    try {
      const invitation = snap.data();
      
      console.log('Invitation created:', invitation);

      // Obtener configuración de SendGrid
      const sendgridKey = process.env.SENDGRID_API_KEY;
      const sendgridEmail = process.env.SENDGRID_FROM_EMAIL;
      const appUrl = process.env.APP_URL || 'http://localhost:4200';

      // Verificar que tenemos SendGrid configurado
      if (!sendgridKey) {
        console.warn('SendGrid API key not configured. Skipping email.');
        return;
      }

      sgMail.setApiKey(sendgridKey);

      // Obtener datos del dependiente
      const dependentRef = admin.firestore().collection('dependents').doc(invitation.dependentId);
      const dependentSnap = await dependentRef.get();
      
      if (!dependentSnap.exists) {
        console.error('Dependent not found:', invitation.dependentId);
        return;
      }

      const dependent = dependentSnap.data();
      const invitationLink = `${appUrl}/accept-invitation?token=${invitation.invitationToken}`;

      // Construir el email
      const msg: sgMail.MailDataRequired = {
        to: invitation.invitedEmail,
        from: sendgridEmail || 'noreply@amanah.app',
        subject: `Invitación para cuidar a ${dependent?.name || 'un dependiente'}`,
        html: `
          <h2>Invitación para cuidador</h2>
          <p>Hola,</p>
          <p>Has sido invitado para cuidar a <strong>${dependent?.name || 'un dependiente'}</strong>.</p>
          <p>
            <a href="${invitationLink}" style="background-color: #B8A5D6; color: #1A1A1A; padding: 12px 28px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; margin: 20px 0;">
              Aceptar Invitación
            </a>
          </p>
          <p>O copia y pega este link en tu navegador:</p>
          <p><code>${invitationLink}</code></p>
          <p><strong>Nota:</strong> El link vence en 7 días.</p>
          <br/>
          <p>Gracias,<br/><strong>Equipo de Amanah</strong></p>
        `,
        text: `Hola,\n\nHas sido invitado para cuidar a ${dependent?.name || 'un dependiente'}.\n\nAccede a este link para aceptar:\n${invitationLink}\n\nNota: El link vence en 7 días.\n\nGracias,\nEquipo de Amanah`
      };

      // Enviar el email
      await sgMail.send(msg);
      console.log('Email sent successfully to:', invitation.invitedEmail);

    } catch (error) {
      console.error('Error sending invitation email:', error);
      // No fallar la función, solo registrar el error
    }
  });

/**
 * Cloud Function: Chat con IA (Groq API)
 * Llamable desde el frontend para hacer preguntas sobre tareas, medicamentos, citas, etc.
 * 
 * Seguridad:
 * - Requiere autenticación Firebase
 * - Obtiene datos solo del dependiente asignado al usuario
 * - Sanitiza información sensible antes de enviar a Groq
 * - Registra logs de auditoría para RGPD
 * - API Key de Groq está segura en el servidor (no en el frontend)
 */
export const chatAI = functions.https.onCall(async (data: any, context: any) => {
  // 1. VALIDACIÓN DE AUTENTICACIÓN
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'Usuario no autenticado. Debes estar logged-in para usar el chat de IA.'
    );
  }

  const userId = context.auth.uid;
  const userMessage = data.message?.trim();
  const dependentId = data.dependentId;

  // 2. VALIDAR PARÁMETROS
  if (!userMessage || userMessage.length === 0) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'El mensaje no puede estar vacío.'
    );
  }

  if (!dependentId) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Debe proporcionar un dependentId.'
    );
  }

  if (userMessage.length > 1000) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'El mensaje es demasiado largo (máx 1000 caracteres).'
    );
  }

  // Guardrail de seguridad: ante síntomas agudos, no dar pautas clínicas detalladas.
  const lowerMessage = userMessage.toLowerCase();
  const urgentKeywords = [
    'vomita',
    'vomito',
    'convulsion',
    'convulsión',
    'desmayo',
    'no respira',
    'sangrado',
    'fiebre alta',
    'dolor en el pecho',
    'dificultad para respirar',
    'urgencia',
    'emergencia'
  ];

  const isUrgentSymptomQuery = urgentKeywords.some(keyword => lowerMessage.includes(keyword));
  if (isUrgentSymptomQuery) {
    return {
      success: true,
      reply: 'Siento que esten pasando por esto. No puedo dar indicaciones medicas especificas ni modificar tratamientos. Contacta cuanto antes con su profesional sanitario o urgencias para orientacion inmediata. Si hay signos graves (dificultad para respirar, perdida de consciencia, convulsiones, sangrado importante o empeoramiento rapido), llama al servicio de emergencias de tu zona ahora.',
      timestamp: new Date().toISOString()
    };
  }

  try {
    const db = admin.firestore();
    const toJSDate = (value: any): Date | null => {
      if (!value) return null;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
      if (typeof value?.toDate === 'function') {
        const d = value.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      }
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? null : d;
    };

    // 3. OBTENER DATOS DEL USUARIO Y VERIFICAR QUE TIENE ACCESO AL DEPENDIENTE
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      console.error(`User not found: ${userId}`);
      throw new functions.https.HttpsError('not-found', 'Usuario no encontrado.');
    }

    const userData = userSnap.data() || {};
    const caregiverFullName =
      userData.fullName || userData.name || userData.displayName || context.auth.token?.name || '';
    const caregiverFirstName = (typeof caregiverFullName === 'string' ? caregiverFullName.trim().split(/\s+/)[0] : '') || 'cuidador';

    // 4. OBTENER DATOS DEL DEPENDIENTE
    const dependentRef = db.collection('dependents').doc(dependentId);
    const dependentSnap = await dependentRef.get();

    if (!dependentSnap.exists) {
      console.error(`Dependent not found: ${dependentId}`);
      throw new functions.https.HttpsError('not-found', 'Dependiente no encontrado.');
    }

    // 5. VERIFICAR ACCESO: El usuario debe ser cuidador/propietario del dependiente
    const dependentData = dependentSnap.data() || {};
    const ownerCandidates = [
      dependentData.ownerId,
      dependentData.userId,
      dependentData.createdBy,
      dependentData.primaryCaregiverId
    ].filter(Boolean);

    const caregiversRaw = [
      ...(Array.isArray(dependentData.caregivers) ? dependentData.caregivers : []),
      ...(Array.isArray(dependentData.caregiverIds) ? dependentData.caregiverIds : [])
    ];

    const caregiverIds = caregiversRaw
      .map((c: any) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object') {
          return c.userId || c.uid || c.id || null;
        }
        return null;
      })
      .filter((id: any) => typeof id === 'string');

    let hasAccess = ownerCandidates.includes(userId) || caregiverIds.includes(userId);

    // Fallback: validar relación explícita en caregiver_dependents
    if (!hasAccess) {
      const relationSnap = await db
        .collection('caregiver_dependents')
        .where('dependentId', '==', dependentId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

      hasAccess = !relationSnap.empty;
    }

    if (!hasAccess) {
      console.error(`User ${userId} does not have access to dependent ${dependentId}`);
      throw new functions.https.HttpsError(
        'permission-denied',
        'No tienes permisos para acceder a este dependiente.'
      );
    }

    // 6. OBTENER DATOS CONTEXTUALES (SANITIZADOS)
    // ✅ NUEVA ESTRUCTURA: Lee SOLO de subcollections de dependientes
    const [tasksDependentSnap, medicationsDependentSnap, appointmentsDependentSnap] = await Promise.all([
      db.collection(`dependents/${dependentId}/tasks`).get(),
      db.collection(`dependents/${dependentId}/medications`).get(),
      db.collection(`dependents/${dependentId}/appointments`).get()
    ]);

    // Combinar con legacy si es necesario (pero priorizar nuevo sistema)
    const tasksDocs = tasksDependentSnap.docs;

    const medicationDocs = medicationsDependentSnap.docs;

    const appointmentDocs = appointmentsDependentSnap.docs;

    // 7. CONSTRUIR CONTEXTO SANITIZADO (sin información sensible)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const formatLocalDate = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const isSameDay = (firstDate: Date, secondDate: Date): boolean => {
      return (
        firstDate.getDate() === secondDate.getDate() &&
        firstDate.getMonth() === secondDate.getMonth() &&
        firstDate.getFullYear() === secondDate.getFullYear()
      );
    };

    const getRecurringTaskSchedulesForToday = (taskData: any) => {
      const dueDate = toJSDate(taskData.dueDate);
      if (!dueDate) return false;

      const recurrence = taskData.recurrence || {};
      const recurrenceExceptions = Array.isArray(taskData.recurrenceExceptions) ? taskData.recurrenceExceptions : [];
      const dueDateString = formatLocalDate(dueDate);
      const movedAwayFromToday = dueDateString === todayString && recurrenceExceptions.some((exception: any) => exception.originalDate === todayString && exception.newDate !== todayString);
      const movedToToday = recurrenceExceptions.some((exception: any) => exception.newDate === todayString);
      const startDate = new Date(dueDate);
      const recurrenceEndDate = recurrence.endDate ? toJSDate(recurrence.endDate) : null;
      const endsAfterDays = typeof recurrence.endsAfterDays === 'number' ? recurrence.endsAfterDays : null;
      const endDate = (() => {
        if (recurrenceEndDate) return recurrenceEndDate;
        if (endsAfterDays !== null && Number.isFinite(endsAfterDays)) {
          const computedEnd = new Date(startDate);
          computedEnd.setDate(computedEnd.getDate() + endsAfterDays);
          return computedEnd;
        }
        return null;
      })();

      if (movedAwayFromToday) return false;
      if (dueDateString === todayString || movedToToday) return true;

      if (startDate > today) return false;
      if (endDate && endDate < today) return false;
      
      // FIX: Rechazar tareas vencidas NO recurrentes
      const frequency = (recurrence.frequency || 'never').toLowerCase();
      if (frequency === 'never' && startDate < today) return false;

      switch (recurrence.frequency) {
        case 'daily':
          return true;
        case 'weekly': {
          const dayMap: Record<string, number> = {
            sunday: 0,
            monday: 1,
            tuesday: 2,
            wednesday: 3,
            thursday: 4,
            friday: 5,
            saturday: 6,
          };

          const allowedDays = Array.isArray(recurrence.daysOfWeek)
            ? recurrence.daysOfWeek
                .map((day: any) => {
                  if (typeof day === 'number') {
                    return day;
                  }

                  const normalizedDay = String(day || '').toLowerCase();
                  return dayMap[normalizedDay];
                })
                .filter((day: any) => typeof day === 'number')
            : [];

          return allowedDays.includes(today.getDay());
        }
        case 'monthly':
          return startDate.getDate() === today.getDate();
        case 'yearly':
          return startDate.getDate() === today.getDate() && startDate.getMonth() === today.getMonth();
        default:
          return false;
      }
    };

    const tasksTodayDocs = tasksDocs
      .map(doc => ({ id: doc.id, ...(doc.data() as any) }))
      .filter(task => getRecurringTaskSchedulesForToday(task));

    const isTaskAssignedToCurrentUser = (taskData: any): boolean => {
      const assignedTo = Array.isArray(taskData?.assignedTo) ? taskData.assignedTo : [];
      return assignedTo.some((assignee: any) => {
        if (typeof assignee === 'string') return assignee === userId;
        if (assignee && typeof assignee === 'object') {
          return assignee.userId === userId || assignee.uid === userId || assignee.id === userId;
        }
        return false;
      });
    };

    const visibleTasksTodayDocs = tasksTodayDocs.filter(task => isTaskAssignedToCurrentUser(task));

    const tasksCompletedToday = visibleTasksTodayDocs.filter(task => {
      const status = String(task.status || '').toLowerCase();
      const completedAt = toJSDate(task.completedAt);
      const completedInstances = Array.isArray(task.completedInstances) ? task.completedInstances : [];
      const completedToday = !!completedAt && isSameDay(completedAt, today);
      return status === 'completed' || completedToday || completedInstances.includes(todayString);
    }).length;

    const tasksToday = visibleTasksTodayDocs
      .filter(task => {
        const status = String(task.status || '').toLowerCase();
        return status !== 'completed';
      })
      .map(task => task.title)
      .filter((title: any) => typeof title === 'string' && title.trim().length > 0);

    const tasksTodayDetails = visibleTasksTodayDocs
      .map(task => {
        const status = String(task.status || '').toLowerCase();
        const completedAt = toJSDate(task.completedAt);
        const completedInstances = Array.isArray(task.completedInstances) ? task.completedInstances : [];
        const completedToday = !!completedAt && isSameDay(completedAt, today);
        return {
          title: task.title || 'Tarea',
          dueTime: task.dueTime || '',
          completed: status === 'completed' || completedToday || completedInstances.includes(todayString),
          priority: task.priority || 'medium'
        };
      });

    const activeMedications = medicationDocs
      .map(doc => doc.data())
      .filter(data => {
        const isActive = data.isActive !== false;
        if (!isActive) return false;

        const startDate = toJSDate(data.startDate);
        const endDate = toJSDate(data.endDate);
        const now = new Date();

        if (startDate && startDate > now) return false;
        if (endDate && endDate < now) return false;
        return true;
      })
      .map(data => {
        const schedules = Array.isArray(data.schedules)
          ? data.schedules
          : Object.values(data.schedules || {});

        const schedulesWithStatus = schedules.map((s: any) => {
          const completedAtDate = toJSDate(s?.completedAt);
          const takenToday =
            s?.lastCompletedDate === todayString ||
            (Array.isArray(s?.completionHistory) && s.completionHistory.includes(todayString)) ||
            (!!completedAtDate && isSameDay(completedAtDate, today));

          return {
            time: s?.time || 'hora no definida',
            dosage: s?.dosage || data.dose || 'dosis no definida',
            takenToday,
            notes: s?.notes || ''
          };
        });

        return {
          name: data.name || 'Medicación',
          dose: data.dose || 'según prescripción',
          schedules: schedulesWithStatus,
          takenTodayCount: schedulesWithStatus.filter((s: any) => s.takenToday).length,
          totalScheduleCount: schedulesWithStatus.length
        };
      });

    const totalDosesToday = activeMedications.reduce((acc, med) => {
      return acc + med.totalScheduleCount;
    }, 0);

    const dosesTakenToday = activeMedications.reduce((acc, med) => {
      return acc + med.takenTodayCount;
    }, 0);

    const normalizedAppointments = appointmentDocs
      .map(doc => doc.data())
      .map(data => {
        const status = String(data.status || 'scheduled').toLowerCase();
        const appointmentDate = toJSDate(data.date || data.dateTime || data.startDate);
        return { data, status, appointmentDate };
      });

    const appointmentStatusSummary = {
      completed: normalizedAppointments.filter(a => a.status === 'completed').length,
      cancelled: normalizedAppointments.filter(a => a.status === 'cancelled').length,
      overdue: normalizedAppointments.filter(a => a.status === 'overdue').length
    };

    const upcomingAppointments = normalizedAppointments
      .filter(item => {
        if (item.status === 'completed' || item.status === 'cancelled') return false;
        return !!item.appointmentDate && item.appointmentDate > new Date();
      })
      .sort((a, b) => {
        const dateA = a.appointmentDate || new Date(0);
        const dateB = b.appointmentDate || new Date(0);
        return dateA.getTime() - dateB.getTime();
      })
      .slice(0, 5)
      .map(item => {
        const data = item.data;
        const appointmentDate = item.appointmentDate;
        return {
          title: data.specialty || data.title || data.type || 'Cita médica',
          date: appointmentDate ? appointmentDate.toLocaleDateString('es-ES') : 'Sin fecha',
          time: data.time || (appointmentDate ? appointmentDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : 'Sin hora específica')
        };
      });

    const dependentName = dependentData?.name || 'dependiente';

    const tasksSummaryText = tasksTodayDetails.length > 0
      ? tasksTodayDetails
          .map(task => {
            let line = '- ' + task.title;
            if (task.dueTime) {
              line += ' (' + task.dueTime + ')';
            }
            if (task.completed) {
              line += ' [completada]';
            }
            return line;
          })
          .join('\n')
      : '- No hay tareas programadas para hoy';

    const medicationsSummaryText = activeMedications.length > 0
      ? activeMedications
          .map(med => {
            const pendingSchedules = med.schedules.filter((schedule: any) => !schedule.takenToday);
            const scheduleDetails = med.schedules
              .map((schedule: any) => {
                let line = schedule.time + ' (' + schedule.dosage + ')';
                line += schedule.takenToday ? ' [tomada]' : ' [pendiente]';
                return line;
              })
              .join('; ');

            return `- ${med.name} ${med.dose}: ${med.takenTodayCount}/${med.totalScheduleCount} tomadas, ${pendingSchedules.length} pendientes. Horarios: ${scheduleDetails}`;
          })
          .join('\n')
      : '- No hay medicación activa';

    const buildDeterministicReply = (): string | null => {
      const wantsTasks = /\btarea\b|\btareas\b|\bpendientes?\b|fisioterapia/i.test(userMessage);
      const wantsMedication = /medic|dosis|jarabe|paracetamol|diazepam|capsul|cápsul|tableta|comprim|inyecc|pastilla/i.test(userMessage);
      const wantsSummary = /resumen|qué hay hoy|que hay hoy|qué hay|que hay/i.test(userMessage);

      const parseTimeToMinutes = (timeValue: string): number => {
        const timeMatch = /^([0-9]{1,2}):([0-9]{2})/.exec(String(timeValue || ''));
        if (!timeMatch) return Number.MAX_SAFE_INTEGER;
        const hours = Number(timeMatch[1]);
        const minutes = Number(timeMatch[2]);
        return (hours * 60) + minutes;
      };

      if (wantsTasks && !wantsMedication) {
        const pendingTasks = tasksTodayDetails.filter(task => !task.completed);
        const completedTasks = tasksTodayDetails.filter(task => task.completed);

        if (tasksTodayDetails.length === 0) {
          return 'Según el contexto de ' + dependentName + ', no hay tareas programadas para hoy.';
        }

        const pendingTasksText = pendingTasks.length > 0
          ? pendingTasks
              .map(task => task.title + (task.dueTime ? ' a las ' + task.dueTime : ''))
              .join(', ')
          : 'ninguna';

        return 'Hoy para ' + dependentName + ' tienes ' + pendingTasks.length + ' tarea(s) pendiente(s): ' + pendingTasksText + '. ' +
          'Tareas completadas hoy: ' + completedTasks.length + '.';
      }

      if (wantsMedication && !wantsTasks) {
        if (activeMedications.length === 0) {
          return 'Según el contexto de ' + dependentName + ', no hay medicación activa para hoy.';
        }

        const pendingDoses = activeMedications.flatMap(med =>
          med.schedules
            .filter((schedule: any) => !schedule.takenToday)
            .map((schedule: any) => ({
              name: med.name,
              time: schedule.time,
              dosage: schedule.dosage
            }))
        ).sort((firstDose, secondDose) => parseTimeToMinutes(firstDose.time) - parseTimeToMinutes(secondDose.time));

        const takenDoses = activeMedications.flatMap(med =>
          med.schedules
            .filter((schedule: any) => schedule.takenToday)
            .map((schedule: any) => ({
              name: med.name,
              time: schedule.time
            }))
        ).sort((firstDose, secondDose) => parseTimeToMinutes(firstDose.time) - parseTimeToMinutes(secondDose.time));

        const pendingText = pendingDoses.length > 0
          ? pendingDoses.map(dose => dose.name + ' a las ' + dose.time + ' (' + dose.dosage + ')').join(', ')
          : 'No queda ninguna dosis pendiente hoy.';

        const takenText = takenDoses.length > 0
          ? takenDoses.map(dose => dose.name + ' a las ' + dose.time).join(', ')
          : 'Todavía no hay dosis marcadas como tomadas hoy.';

        return 'Hoy hay ' + totalDosesToday + ' dosis en total para ' + dependentName + '. ' +
          'Ya están tomadas ' + dosesTakenToday + ' y faltan ' + Math.max(totalDosesToday - dosesTakenToday, 0) + '. ' +
          'Pendientes: ' + pendingText + ' ' +
          'Tomadas: ' + takenText;
      }

      if (wantsSummary && (tasksTodayDetails.length > 0 || activeMedications.length > 0)) {
        const pendingTasks = tasksTodayDetails.filter(task => !task.completed).length;
        const pendingDosesCount = Math.max(totalDosesToday - dosesTakenToday, 0);
        return 'Resumen de hoy para ' + dependentName + ': tienes ' + pendingTasks + ' tarea(s) pendiente(s) y ' + pendingDosesCount + ' dosis pendientes de medicación.';
      }

      return null;
    };

    const deterministicReply = buildDeterministicReply();
    if (deterministicReply) {
      await db.collection('ai_chat_logs').add({
        userId,
        dependentId,
        timestamp: FieldValue.serverTimestamp(),
        questionPreview: userMessage.substring(0, 50),
        hasAppointments: upcomingAppointments.length > 0,
        hasMedications: activeMedications.length > 0,
        hasTasks: tasksTodayDetails.length > 0,
        responseLength: deterministicReply.length,
        deterministicReply: true
      });

      return {
        success: true,
        reply: deterministicReply,
        timestamp: new Date().toISOString()
      };
    }

    console.log(
      `AI context counts => tasksToday:${tasksToday.length}, tasksCompletedToday:${tasksCompletedToday}, activeMeds:${activeMedications.length}, dosesTakenToday:${dosesTakenToday}/${totalDosesToday}, upcomingAppointments:${upcomingAppointments.length}, apptCompleted:${appointmentStatusSummary.completed}, apptCancelled:${appointmentStatusSummary.cancelled}, apptOverdue:${appointmentStatusSummary.overdue}`
    );

    // 8. CONSTRUIR CONTEXTO PARA LA IA (INFORMACIÓN SANITIZADA)
    const appointmentDetails = upcomingAppointments.length > 0 
      ? upcomingAppointments.map(a => `${a.title} el ${a.date} a las ${a.time}`).join('; ')
      : 'sin próximas citas';
    
    const contextLines = [
      'CONTEXTO SANITARIO ANONIMIZADO (SIN IDENTIFICADORES PERSONALES):',
      '- Tareas hoy (asignadas al cuidador actual): total ' + visibleTasksTodayDocs.length + ', completadas ' + tasksCompletedToday + ', pendientes ' + Math.max(visibleTasksTodayDocs.length - tasksCompletedToday, 0),
      '- Medicación activa: ' + activeMedications.length + ' medicamento(s), ' + totalDosesToday + ' dosis hoy, ' + dosesTakenToday + ' tomadas, ' + Math.max(totalDosesToday - dosesTakenToday, 0) + ' pendientes',
      '- Próximas citas: ' + upcomingAppointments.length + (upcomingAppointments.length > 0 ? ' (' + appointmentDetails + ')' : ''),
      '- Estado de citas: completadas ' + appointmentStatusSummary.completed + ', canceladas ' + appointmentStatusSummary.cancelled + ', vencidas ' + appointmentStatusSummary.overdue,
      '- No incluir nombres, identificadores, ni detalles innecesarios de salud'
    ];
    const contextInfo = contextLines.join('\n');

    // 9. CONSTRUIR PROMPT DEL SISTEMA
    const systemPromptLines = [
      'Eres un asistente de salud amable y útil para una aplicación de cuidado de dependientes.',
      '',
      contextInfo,
      '',
      'INSTRUCCIONES:',
      '- Responde en español de manera clara, concisa y amable',
      '- Si la pregunta es sobre tareas, medicamentos o citas, usa el contexto anterior',
      '- No recalcules ni inventes cantidades: si el contexto da listas o conteos, repítelos tal cual',
      '- Sé breve pero informativo (máximo 150 palabras)',
      '- Usa lenguaje sencillo, sin tecnicismos, apto para una persona mayor',
      '- Si no tienes información sobre algo, di honestamente que no tienes esos datos',
      '- NUNCA inventes información médica, diagnósticos o efectos secundarios',
      '- No des instrucciones medicas prescriptivas (dosis, suspender/iniciar medicacion, diagnosticos o tratamiento)',
      '- Si el usuario describe sintomas agudos o posible urgencia, indica consultar inmediatamente a un profesional o emergencias',
      '- Dirígete a la persona de forma neutra y respetuosa',
      '- RGPD: no revelar ni inferir datos personales o sanitarios más allá del mínimo necesario',
      '- Si la pregunta no está relacionada con salud/cuidado, redirige amablemente al tema principal'
    ];
    const systemPrompt = systemPromptLines.join('\n');

    // 10. LLAMAR A GROQ API (GRATIS Y RÁPIDA)
    console.log('Calling Groq API...');
    
    const groqApiKey = process.env.GROQ_API_KEY;
    
    if (!groqApiKey) {
      console.error('GROQ_API_KEY not configured');
      throw new functions.https.HttpsError(
        'internal',
        'Servicio de IA no configurado. Contacta al administrador.'
      );
    }
    
    try {
      const configuredModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
      const candidateModels = [
        configuredModel,
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile',
        'gemma2-9b-it'
      ];

      let aiResponse = '';
      let lastGroqError = '';

      for (const model of candidateModels) {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${groqApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: systemPrompt
              },
              {
                role: 'user',
                content: userMessage
              }
            ],
            temperature: 0.7,
            max_tokens: 300
          })
        });

        if (response.ok) {
          const result: any = await response.json();
          aiResponse = result?.choices?.[0]?.message?.content || 'Sin respuesta del asistente';
          console.log(`Groq model used: ${model}`);
          break;
        }

        const errorBody = await response.text();
        lastGroqError = `${response.status} - ${errorBody}`;
        console.error(`Groq API error with model ${model}: ${lastGroqError}`);
      }

      if (!aiResponse) {
        throw new functions.https.HttpsError(
          'internal',
          `Error al conectar con el servicio de IA. ${lastGroqError || 'No se obtuvo respuesta.'}`
        );
      }

      // 11. REGISTRAR EN AUDITORÍA (RGPD COMPLIANT)
      await db.collection('ai_chat_logs').add({
        userId,
        dependentId,
        timestamp: FieldValue.serverTimestamp(),
        questionPreview: userMessage.substring(0, 50),
        hasAppointments: upcomingAppointments.length > 0,
        hasMedications: activeMedications.length > 0,
        hasTasks: tasksToday.length > 0,
        responseLength: aiResponse.length
      });

      // 12. RETORNAR RESPUESTA
      return {
        success: true,
        reply: aiResponse,
        timestamp: new Date().toISOString()
      };
    } catch (groqError) {
      console.error('Groq API error:', groqError);
      throw new functions.https.HttpsError(
        'internal',
        'Error al procesar tu pregunta. Intenta nuevamente más tarde.'
      );
    }
  } catch (error: any) {
    console.error('Error in chatAI function:', error);

    // Retornar errores conocidos
    if (error.code && error.message) {
      throw error;
    }

    // Otros errores
    throw new functions.https.HttpsError(
      'internal',
      'Error al procesar tu pregunta. Intenta nuevamente más tarde.'
    );
  }
});
