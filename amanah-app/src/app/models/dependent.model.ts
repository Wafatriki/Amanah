export interface Dependent {
  id: string;
  name: string;
  age: number;
  image?: string;
  medicalConditions: string[];
  createdAt: Date;
  createdBy: string;
}
