#!/usr/bin/env bun
/**
 * Mint a VAPID key pair for web push (CLAUDE.md §D21).
 *
 *   bun run push:keys
 *
 * Prints the three environment variables the server reads. The pair is this
 * deployment's identity to the push services, so:
 *
 *   - Keep the private key secret; anyone holding it can push to your subscribers.
 *   - Don't rotate it casually. A subscription is bound to the key that created it, and
 *     a push signed by a different one is rejected — every subscribed device has to opt
 *     in again. Use separate pairs for local and production, not a rotation between them.
 *   - VAPID_SUBJECT is a `mailto:` or `https:` URL identifying whoever runs the server;
 *     push services use it to make contact if your messages misbehave. It's required.
 */

import { generateVAPIDKeys } from "web-push";

const { publicKey, privateKey } = generateVAPIDKeys();
const subject = process.argv[2] ?? "mailto:you@example.com";

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=${subject}`);
if (!process.argv[2]) {
	console.log(
		"\n# Pass a contact URL to set the subject: bun run push:keys mailto:you@band.cz",
	);
}
