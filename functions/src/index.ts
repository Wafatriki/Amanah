import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import sgMail from '@sendgrid/mail';
import * as path from 'path';
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

// Inicializar Firebase Admin
admin.initializeApp();

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
      if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
      if (typeof value?.toDate === 'function') {
        const d = value.toDate();
        return d instanceof Date && !isNaN(d.getTime()) ? d : null;
      }
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
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
    const [tasksSnap, medicationsRootSnap, medicationsDependentSnap, appointmentsRootSnap, appointmentsDependentSnap] = await Promise.all([
      db.collection('tasks').where('dependentId', '==', dependentId).get(),
      db.collection('medications').where('dependentId', '==', dependentId).get(),
      db.collection(`dependents/${dependentId}/medications`).get(),
      db.collection('appointments').where('dependentId', '==', dependentId).get(),
      db.collection(`dependents/${dependentId}/appointments`).get()
    ]);

    const medicationDocs = [
      ...medicationsRootSnap.docs,
      ...medicationsDependentSnap.docs
    ];

    const appointmentDocs = [
      ...appointmentsRootSnap.docs,
      ...appointmentsDependentSnap.docs
    ];

    // 7. CONSTRUIR CONTEXTO SANITIZADO (sin información sensible)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const tasksTodayDocs = tasksSnap.docs
      .filter(doc => {
        const data = doc.data();
        const taskDate = toJSDate(data.dueDate);
        if (!taskDate) return false;
        taskDate.setHours(0, 0, 0, 0);
        return taskDate.getTime() === today.getTime();
      })
      .map(doc => doc.data());

    const tasksCompletedToday = tasksTodayDocs.filter(task => {
      const status = String(task.status || '').toLowerCase();
      const completedAt = toJSDate(task.completedAt);
      const completedToday = !!completedAt && completedAt.toDateString() === today.toDateString();
      return status === 'completed' || completedToday;
    }).length;

    const tasksToday = tasksTodayDocs
      .filter(task => {
        const status = String(task.status || '').toLowerCase();
        return status !== 'completed';
      })
      .map(task => task.title)
      .filter((title: any) => typeof title === 'string' && title.trim().length > 0);

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
            (!!completedAtDate && completedAtDate.toDateString() === today.toDateString());

          return {
            time: s?.time || 'hora no definida',
            dosage: s?.dosage || data.dose || 'dosis no definida',
            takenToday
          };
        });

        return {
          name: data.name || 'Medicación',
          dose: data.dose || 'según prescripción',
          schedules: schedulesWithStatus
            .map((s: any) => `${s.time} (${s.dosage})`)
            .filter((s: any) => typeof s === 'string'),
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

    console.log(
      `AI context counts => tasksToday:${tasksToday.length}, tasksCompletedToday:${tasksCompletedToday}, activeMeds:${activeMedications.length}, dosesTakenToday:${dosesTakenToday}/${totalDosesToday}, upcomingAppointments:${upcomingAppointments.length}, apptCompleted:${appointmentStatusSummary.completed}, apptCancelled:${appointmentStatusSummary.cancelled}, apptOverdue:${appointmentStatusSummary.overdue}`
    );

    // 8. CONSTRUIR CONTEXTO PARA LA IA (INFORMACIÓN SANITIZADA)
    const contextInfo = `
CONTEXTO DEL DEPENDIENTE "${dependentName}":
- Tareas para hoy: ${tasksToday.length > 0 ? tasksToday.join(', ') : 'No hay tareas'}
- Estado de tareas hoy: completadas ${tasksCompletedToday}, pendientes ${Math.max(tasksTodayDocs.length - tasksCompletedToday, 0)}
- Medicamentos activos (${activeMedications.length}) / dosis de hoy (${totalDosesToday}): ${
      activeMedications.length > 0
  ? activeMedications.map(m => `${m.name} ${m.dose}. Horarios: ${m.schedules.length > 0 ? m.schedules.join(', ') : 'sin horarios definidos'}`).join('; ')
        : 'Ninguno'
    }
- Dosis tomadas hoy: ${dosesTakenToday} de ${totalDosesToday}
- Próximas citas (${upcomingAppointments.length}): ${
      upcomingAppointments.length > 0
        ? upcomingAppointments.map(a => `${a.title} el ${a.date} a las ${a.time}`).join('; ')
        : 'Ninguna'
    }
- Estado general de citas: completadas ${appointmentStatusSummary.completed}, canceladas ${appointmentStatusSummary.cancelled}, vencidas ${appointmentStatusSummary.overdue}
`;

    // 9. CONSTRUIR PROMPT DEL SISTEMA
    const systemPrompt = `Eres un asistente de salud amable y útil para una aplicación de cuidado de dependientes.

${contextInfo}

  DATOS DE CONTEXTO DEL CUIDADOR:
  - Nombre del cuidador: ${caregiverFirstName}

INSTRUCCIONES:
- Responde en español de manera clara, concisa y amable
- Si la pregunta es sobre tareas, medicamentos o citas, usa el contexto anterior
- Sé breve pero informativo (máximo 150 palabras)
- Si no tienes información sobre algo, di honestamente que no tienes esos datos
- NUNCA inventes información médica, diagnósticos o efectos secundarios
- No des instrucciones medicas prescriptivas (dosis, suspender/iniciar medicacion, diagnosticos o tratamiento)
- Si el usuario describe sintomas agudos o posible urgencia, indica consultar inmediatamente a un profesional o emergencias
  - Dirigete al usuario por su nombre (${caregiverFirstName}) o de forma neutra. Nunca le llames "Amanah"
- Si la pregunta no está relacionada con salud/cuidado, redirige amablemente al tema principal`;

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
