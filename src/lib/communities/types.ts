export type CommunityRole = "owner" | "moderator" | "member";
export interface Community {
  id: string; slug: string; name: string; description: string;
  memberCount: number; createdBy: string; createdAt: string;
}
export interface CommunityMember {
  userId: string; role: CommunityRole;
  username: string; displayName: string | null; avatarUrl: string | null;
}
