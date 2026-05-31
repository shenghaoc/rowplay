import { toast } from 'svelte-sonner';
import type { I18n } from '$lib/i18n.svelte';

let updateToastShown = false;

function showUpdateToast(i18n: I18n, registration: ServiceWorkerRegistration) {
	if (updateToastShown || !registration.waiting) return;
	updateToastShown = true;
	const t = i18n.t;
	toast.info(t('pwa.updateAvailable'), {
		duration: Infinity,
		action: {
			label: t('pwa.reload'),
			onClick: () => {
				registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
			}
		}
	});
}

/** Listen for waiting service workers and prompt the user to reload. */
export function initPwaUpdate(i18n: I18n) {
	if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

	let refreshing = false;
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (refreshing) return;
		refreshing = true;
		location.reload();
	});

	void navigator.serviceWorker.ready.then((registration) => {
		if (registration.waiting) showUpdateToast(i18n, registration);

		registration.addEventListener('updatefound', () => {
			const worker = registration.installing;
			if (!worker) return;
			worker.addEventListener('statechange', () => {
				if (worker.state === 'installed' && navigator.serviceWorker.controller) {
					showUpdateToast(i18n, registration);
				}
			});
		});
	});
}
