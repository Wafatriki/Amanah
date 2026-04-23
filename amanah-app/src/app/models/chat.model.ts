export interface ChatMessage {
  id?: string;
  dependentId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  text: string;
  imageUrl?: string; // URL de la imagen si la hay
  fileUrl?: string; // URL del archivo si la hay
  fileName?: string; // Nombre del archivo
  fileType?: string; // Tipo MIME del archivo
  timestamp: Date;
  isEdited?: boolean;
  editedAt?: Date;
  isRead?: boolean; // Si ha sido leído
  readAt?: Date; // Cuándo fue leído
}

export interface ChatRoom {
  id?: string;
  dependentId: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  participantIds: string[]; // IDs de los cuidadores + dependiente
  createdAt: Date;
  updatedAt: Date;
}
