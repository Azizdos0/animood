import type { Route } from "next";
import type { Media, MediaType } from "@/lib/anilist/types";

export const MOODS = [
  { id: "emotional", label: "Wrecked me", symbol: "◒", note: "A story that stays with you.",
    heading: "Feel every frame.", genres: ["Drama", "Romance"], tags: ["Tragedy", "Coming of Age", "Family Life"], avoid: [] },
  { id: "adrenaline", label: "Fists up", symbol: "ϟ", note: "Big stakes. One more episode.",
    heading: "Turn the energy up.", genres: ["Action", "Sports"], tags: ["Martial Arts", "Super Power", "Battle Royale"], avoid: [] },
  { id: "calm", label: "Soft & slow", symbol: "≈", note: "Small moments. Room to breathe.",
    heading: "Take the long way home.", genres: ["Slice of Life"], tags: ["Iyashikei", "Rural", "Food"], avoid: ["Horror", "Thriller", "Tragedy", "Gore"] },
  { id: "cerebral", label: "Mind-bent", symbol: "⌘", note: "A puzzle worth falling into.",
    heading: "Question everything.", genres: ["Psychological", "Mystery"], tags: ["Time Manipulation", "Time Loop", "Detective", "Conspiracy"], avoid: [] },
  { id: "comfort", label: "Comfort zone", symbol: "☼", note: "A little lighter by the end.",
    heading: "Find your happy place.", genres: ["Comedy", "Slice of Life"], tags: ["Iyashikei", "Found Family", "Cute Girls Doing Cute Things"], avoid: ["Horror", "Thriller", "Tragedy", "Gore"] },
  { id: "romance", label: "Butterflies", symbol: "♡", note: "Almost-confessions. All the feelings.",
    heading: "Let your heart pick.", genres: ["Romance"], tags: ["First Love", "Love Triangle", "Primarily Adult Cast"], avoid: [] },
] as const;

export type MoodId = typeof MOODS[number]["id"];
export type Mood = typeof MOODS[number];
export function getMood(id: unknown): Mood | undefined {
  return MOODS.find(m => m.id === id);
}
export function discoveryHref(id: MoodId | null, type: MediaType = "ANIME"): Route {
  return `/recommendations?type=${type}${id ? `&mood=${id}` : ""}` as Route;
}

/** Evidence is drawn from catalog metadata, never inferred plot details. */
export function moodAffinity(media: Media, mood: Mood): { score: number; evidence: string[] } {
  const genres: readonly string[] = mood.genres;
  const tags: readonly string[] = mood.tags;
  const avoid: readonly string[] = mood.avoid;
  if (media.genres.some(g => avoid.includes(g))
    || media.tags.some(t => t.rank >= 50 && avoid.includes(t.name))) return { score: 0, evidence: [] };
  const matchedGenres = media.genres.filter(g => genres.includes(g));
  const matchedTags = media.tags.filter(t => tags.includes(t.name) && t.rank >= 40);
  const raw = matchedGenres.length * 0.7 + matchedTags.reduce((sum, t) => sum + t.rank / 100, 0);
  return { score: Math.min(1, raw / 2), evidence: [...matchedGenres, ...matchedTags.map(t => t.name)].slice(0, 2) };
}
