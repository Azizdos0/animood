import { describe, expect, it } from "vitest";
import { combineSyncStatus } from "@/components/SyncProvider";

describe("combineSyncStatus", () => {
  it("defers to the list when preference sync is not deployed", () => {
    expect(combineSyncStatus("synced", "local")).toBe("synced");
    expect(combineSyncStatus("error", "local")).toBe("error");
  });
  it("shows an error from either session", () => {
    expect(combineSyncStatus("synced", "error")).toBe("error");
    expect(combineSyncStatus("error", "synced")).toBe("error");
  });
  it("shows activity from either session, and synced only when both are", () => {
    expect(combineSyncStatus("synced", "syncing")).toBe("syncing");
    expect(combineSyncStatus("syncing", "synced")).toBe("syncing");
    expect(combineSyncStatus("synced", "synced")).toBe("synced");
    expect(combineSyncStatus("local", "local")).toBe("local");
  });
});
