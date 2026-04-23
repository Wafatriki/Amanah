export interface AppointmentNote {
  date: Date;
  text: string;
  userId: string;
  userName: string;
}

export interface Appointment {
  id?: string;
  dependentId: string;
  date: Date;
  time: string; // HH:mm format
  specialty: string; // ej: "Cardiología", "Neurología"
  location: string; // ej: "Hospital San Juan", "Clínica Privada"
  doctor?: string; // nombre del médico
  reason?: string; // motivo de la cita
  notes?: string; // notas pre-cita
  postAppointmentNotes: AppointmentNote[]; // notas agregadas después de la cita
  status: 'scheduled' | 'overdue' | 'completed' | 'cancelled'; // estado de la cita
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // userId quien creó el registro
  isLate?: boolean; // si se llegó tarde
  duration?: number; // duración en minutos (estimada)
  assignedCaregiverIds: string[]; // IDs de cuidadores asignados a la cita
  assignedCaregiverNames?: string[]; // nombres de cuidadores asignados
  reminder?: {
    enabled: boolean;
    minutesBefore: number; // minutos antes de la cita (15, 30, 60, 1440 = 1 día)
  };
}
