export interface User {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt : Date;
  phoneNumber: string;
  phone?: string;
  image?: string;
  specialization?: string;
}

export enum UserRole {
  ADMIN = 'admin',
  DEPENDENT = 'dependent',
  PRIMARY_CAREGIVER = 'primary_caregiver',
  COLLABORATIVE_CAREGIVER = 'collaborative_caregiver',
  INVITED = 'invited'

}
