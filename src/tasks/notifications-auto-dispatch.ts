import { defineTask } from "nitro/task";
import { isEmailConfigured } from "../lib/email";
import {
	type DispatchResult,
	dispatchNotificationOutbox,
} from "../lib/outbox.server";

export default defineTask<DispatchResult | { skipped: string }>({
	meta: {
		name: "notifications:auto-dispatch",
		description:
			"Send queued notification emails when automatic delivery is enabled.",
	},
	async run() {
		if (!isEmailConfigured()) {
			return { result: { skipped: "email-not-configured" } };
		}

		const result = await dispatchNotificationOutbox({
			onlyWhenAutomaticEnabled: true,
		});

		return { result };
	},
});
