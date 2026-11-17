export type Role = 'customer' | 'store_owner' | 'driver' | 'admin';
export type Session = { access_token: string; refresh_token: string };
export type Profile = {
  user_id: number;
  full_name: string;
  role: Role;
  phone: string;
  full_name_ar?: string | null;
  email?: string | null;
  created_at?: string;
  profile_photo_url?: string | null;
};
