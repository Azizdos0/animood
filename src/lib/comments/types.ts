export interface CommentItem {
  id: string;
  mediaId: number;
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  body: string;
  createdAt: string;
}
