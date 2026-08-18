import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatTile } from "@/components/stats/StatTile";
import { BarList } from "@/components/stats/BarList";
import { ScoreHistogram } from "@/components/stats/ScoreHistogram";
import { AffinityBars } from "@/components/stats/AffinityBars";

describe("stat charts", () => {
  it("StatTile shows label and value", () => {
    render(<StatTile label="Episodes" value="1,234" sub="watched" />);
    expect(screen.getByText("Episodes")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("BarList renders a row per item and an empty state", () => {
    const { rerender } = render(<BarList items={[{ name: "Action", count: 5 }, { name: "Comedy", count: 2 }]} />);
    expect(screen.getByText("Action")).toBeInTheDocument();
    expect(screen.getByText("Comedy")).toBeInTheDocument();
    rerender(<BarList items={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it("ScoreHistogram renders all 10 score labels", () => {
    render(<ScoreHistogram data={Array.from({ length: 10 }, (_, i) => ({ score: i + 1, count: i }))} />);
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("AffinityBars shows positive and negative tag names", () => {
    render(<AffinityBars positive={[{ name: "Time Loop", affinity: 2 }]} negative={[{ name: "Ecchi", affinity: -1 }]} />);
    expect(screen.getByText("Time Loop")).toBeInTheDocument();
    expect(screen.getByText("Ecchi")).toBeInTheDocument();
  });
});
