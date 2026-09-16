export interface DiscussionThread {
  id: string; mediaId: number; userId: string; title: string; body?: string;
  createdAt: string; lastActivityAt: string; replyCount: number;
  username: string; displayName: string | null; avatarUrl: string | null;
  communityId?: string; isPinned?: boolean;
}
export interface DiscussionPost {
  id: string; threadId: string; userId: string; parentPostId: string | null;
  body: string; isDeleted: boolean; createdAt: string;
  username: string; displayName: string | null; avatarUrl: string | null;
}
export interface PostNode extends DiscussionPost { children: PostNode[] }
