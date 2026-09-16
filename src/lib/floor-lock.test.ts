import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideFloorBoot } from "./floor-lock.ts";

const lock = {
  v: 1 as const,
  userId: "u1",
  displayName: "Ana",
  email: "ana@local",
  storeId: "s1",
  lockedAt: "2026-01-01T00:00:00.000Z",
};

describe("decideFloorBoot", () => {
  it("keeps a boot screen until the client mounts (no landing flash)", () => {
    assert.equal(
      decideFloorBoot({ mounted: false, authPending: false, userId: null, floorLock: null }),
      "boot",
    );
  });

  it("opens the till when this device already had the local", () => {
    assert.equal(
      decideFloorBoot({ mounted: true, authPending: true, userId: null, floorLock: lock }),
      "desk",
    );
    assert.equal(
      decideFloorBoot({ mounted: true, authPending: false, userId: null, floorLock: lock }),
      "desk",
    );
  });

  it("does not wait for the cloud session when the floor is locked", () => {
    assert.equal(
      decideFloorBoot({ mounted: true, authPending: true, userId: "u1", floorLock: lock }),
      "desk",
    );
  });

  it("shows landing when this device never opened a local and nobody is signed in", () => {
    assert.equal(
      decideFloorBoot({ mounted: true, authPending: false, userId: null, floorLock: null }),
      "landing",
    );
  });

  it("waits the session when signed-out is not confirmed yet", () => {
    assert.equal(
      decideFloorBoot({ mounted: true, authPending: true, userId: null, floorLock: null }),
      "boot",
    );
  });

  it("goes to the hub when signed in but this device has no floor lock", () => {
    assert.equal(
      decideFloorBoot({ mounted: true, authPending: false, userId: "u1", floorLock: null }),
      "hub",
    );
  });
});
