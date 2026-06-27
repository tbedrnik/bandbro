export async function registerForPushNotifications({
	applicationServerKey,
}: {
	applicationServerKey: string;
}) {
	const pm = new PushManager();
	const subscription = await pm.subscribe({ applicationServerKey });
}
