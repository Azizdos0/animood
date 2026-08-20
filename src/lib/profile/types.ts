export interface Profile {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isPublic: boolean;
  createdAt: string;
}
