export interface MedicationSchedule {
  time: string; // HH:mm format
  dosage: string; // ej: "500mg", "1 tableta", etc
  notes?: string; // notas opcionales para esa dosis
  completed?: boolean; // si se ha tomado hoy
  completedAt?: Date; // timestamp cuando se completó
  lastCompletedDate?: string; // YYYY-MM-DD de la última vez que se tomó
  completionHistory?: string[]; // Array de YYYY-MM-DD de todas las veces que se tomó
  reminder?: {
    enabled: boolean;
    minutesBefore: number; // 5, 10, 15, 30, 60 (minutos antes)
  };
}

export interface MedicationHistory {
  date: Date;
  schedules: {
    time: string;
    dosage: string;
    completed: boolean;
    completedAt?: Date;
    notes?: string;
  }[];
}

export interface MedicationObservation {
  date: Date;
  text: string;
  userId: string; // quien hizo la observación
  userName: string;
}

export interface Medication {
  id?: string;
  dependentId: string; // ID del dependiente
  name: string; // ej: "Aspirina", "Metformina"
  dose: string; // ej: "500mg", "2 tabletas"
  presentation: string; // ej: "cápsulas", "comprimidos", "jarabe"
  activeIngredient?: string; // principio activo
  schedules: MedicationSchedule[]; // horarios de administración
  indication?: string; // para qué se usa
  startDate: Date;
  endDate?: Date; // null si está indefinida
  isActive: boolean; // medicamento activo o inactivo
  prescribedBy?: string; // médico que prescribió
  observations: MedicationObservation[]; // historial de notas
  history: MedicationHistory[]; // historial de tomas
  createdAt: Date;
  updatedAt: Date;
  createdBy: string; // userId quien creó el registro
}

export interface MedicationIntake {
  medicationId: string;
  medicationName: string;
  scheduleTime: string;
  scheduleIndex: number; // índice en el array de schedules
  date: Date;
  completed: boolean;
  completedAt?: Date;
}
