export interface Invitation {
  id?: string;
  invitationToken: string;           // Token único para la aceptación
  inviterUserId: string;             // Quien invita (cuidador primario)
  invitedEmail: string;              // Email del invitado
  dependentId: string;               // Dependiente a cuidar
  role: 'primary_caregiver' | 'collaborative_caregiver' | 'invited'; // Rol del nuevo cuidador (invited = solo lectura)
  status: 'pending' | 'accepted' | 'expired'; // Estado
  createdAt: Date;
  expiresAt: Date;                   // Válida por 7 días
  acceptedAt?: Date;
  acceptedByUserId?: string;         // ID del usuario que aceptó
}
