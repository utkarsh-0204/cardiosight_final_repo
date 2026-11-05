// =============================================================================
// User domain model.
// =============================================================================

export type UserRole = 'patient' | 'admin';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: UserRole;
  avatarColor: string;
  gender: 'male' | 'female' | 'other';
  dateOfBirth: string;
  heightCm: number | null;
  weightKg: number | null;
  bloodGroup: string;
  allergies: string[];
  medications: string[];
  medicalConditions: string[];
  isEmailVerified: boolean;
  createdAt: string;
}
