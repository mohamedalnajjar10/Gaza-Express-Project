export type Role = 'customer' | 'store_owner' | 'driver' | 'admin';
export type Session = { access_token: string; refresh_token: string };
export type Profile = {
  user_id: number;
  full_name: string;
  role: Role;
  phone: string;
};
