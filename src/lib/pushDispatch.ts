// Phase 2A: shared push dispatcher. Runs the existing APNs sender and the new
// FCM sender independently (Promise.allSettled) so a failure or throw in one
// provider can never prevent -- or reject through -- the other, and never
// propagates back into the route that triggered the push. Same input contract
// as dispatchApnsPush, so call sites are a mechanical import/name swap.

import { dispatchApnsPush, type ApnsDispatchInput } from "./apns.ts";
import { dispatchFcmPush } from "./fcm.ts";

export type PushDispatchInput = ApnsDispatchInput;

export type PushProviders = {
  apns: (input: PushDispatchInput) => Promise<void>;
  fcm: (input: PushDispatchInput) => Promise<void>;
};

/** Never throws or rejects. */
export async function dispatchPush(input: PushDispatchInput, providers: Partial<PushProviders> = {}): Promise<void> {
  const apns = providers.apns ?? dispatchApnsPush;
  const fcm = providers.fcm ?? dispatchFcmPush;
  // The providers are invoked on separate microtasks so a synchronous throw in
  // one is captured as a rejection instead of skipping the other.
  await Promise.allSettled([
    Promise.resolve().then(() => apns(input)),
    Promise.resolve().then(() => fcm(input)),
  ]);
}
