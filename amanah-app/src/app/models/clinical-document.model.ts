export interface ClinicalDocument {
  id?: string;
  dependentId: string;
  fileName: string;
  fileType: string; // MIME type: application/pdf, image/jpeg, etc
  fileSize: number; // en bytes
  storagePath: string; // ruta en Firebase Storage
  documentType: 'appointment' | 'medication' | 'lab' | 'imaging' | 'prescription' | 'report' | 'other';
  title: string;
  description?: string;
  uploadedBy: string; // userId quien subió
  uploadedByName?: string;
  uploadDate: Date;

  // Asociaciones opcionales
  appointmentId?: string;
  medicationId?: string;

  // Acceso
  accessibleBy: string[]; // array de userIds con acceso
  isPrivate: boolean; // solo el dependiente y creador pueden ver

  // Metadata
  tags?: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentAccessLog {
  documentId: string;
  userId: string;
  userName: string;
  userRole: string;
  accessDate: Date;
  action: 'view' | 'download' | 'share';
}

export const DOCUMENT_TYPE_LABELS: Record<ClinicalDocument['documentType'], string> = {
  'appointment': 'Cita Médica',
  'medication': 'Medicamento',
  'lab': 'Análisis de Laboratorio',
  'imaging': 'Imagen Médica',
  'prescription': 'Receta',
  'report': 'Informe Médico',
  'other': 'Otro'
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export const FILE_EXTENSION_MAP: Record<string, string> = {
  'pdf': '/assets/icons/certificado.png',
  'jpg': '/assets/icons/radiografia-osea.png',
  'jpeg': '/assets/icons/radiografia-osea.png',
  'png': '/assets/icons/radiografia-osea.png',
  'doc': '/assets/icons/notas-medicas.png',
  'docx': '/assets/icons/notas-medicas.png'
};
