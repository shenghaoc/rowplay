import { toast } from 'svelte-sonner';
import type { I18n } from '$lib/i18n.svelte';

let updateToastShown = false;
let reloadAfterUpdate = false;

function showUpdateToast(i18n: I18n, registration: ServiceWorkerRegistration) {
	if (updateToastShown || !registration.waiting) return;
	updateToastShown = true;
	const t = i18n.t;
	toast.info(t('pwa.updateAvailable'), {
		duration: Infinity,
		action: {
			label: t('pwa.reload'),
			onClick: () => {
				reloadAfterUpdate = true;
				registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
			}
		},
		onDismiss: () => {
			updateToastShown = false;
		}
	});
}

/** Listen for waiting service workers and prompt the user to reload. */
export function initPwaUpdate(i18n: I18n) {
	if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (!reloadAfterUpdate) return;
		location.reload();
	});

	void navigator.serviceWorker.ready.then((registration) => {
		if (registration.waiting && navigator.serviceWorker.controller) showUpdateToast(i18n, registration);

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
