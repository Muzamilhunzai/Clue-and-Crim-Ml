import type { Role } from './enums';

/** The signed-in user as attached to every authenticated request (never contains the password hash). */
export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: Role;
  badge_number: string;
  department: string | null;
  phone: string | null;
  is_active: number;
  last_login_at: string | null;
}

export interface UserRow extends AuthUser {
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
