export async function registerForPushNotifications({
	applicationServerKey,
}: {
	applicationServerKey: string;
}) {
	const pm = new PushManager();
	await pm.subscribe({ applicationServerKey });
}
