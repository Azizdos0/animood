import { StatsView } from "@/components/StatsView";

export default function StatsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-primary to-accent" />
        <h1 className="font-display text-2xl font-bold tracking-tight">Stats</h1>
      </div>
      <StatsView />
    </div>
  );
}
