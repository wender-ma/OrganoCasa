/**
 * Browser Notification service for PWA reminders, list updates & post-purchase alerts
 * Fully compliant with Apple iOS 16.4+ Web Push & Android / Desktop Service Worker standards
 */

export interface NotificationPreferences {
  unboughtAlerts: boolean;
  reminderAlerts: boolean;
  listSharedAlerts: boolean;
}

const PREF_KEY = 'organocasa_notification_preferences';

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof localStorage === 'undefined') {
    return { unboughtAlerts: true, reminderAlerts: true, listSharedAlerts: true };
  }
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { unboughtAlerts: true, reminderAlerts: true, listSharedAlerts: true };
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  }
}

/**
 * Checks if the current device is running iOS (iPhone, iPad, iPod)
 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
}

/**
 * Checks if the web app is running in Standalone PWA mode (added to Home Screen)
 */
export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
}

/**
 * Checks if Notifications are supported in the current browser/environment
 */
export function isNotificationSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'Notification' in window;
}

/**
 * Returns the current notification permission state
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Requests Notification permission from the user
 * On iOS, this MUST be called from a direct user gesture (button click/touch)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (err) {
      console.warn('Erro ao solicitar permissão de notificação:', err);
      return false;
    }
  }

  return false;
}

/**
 * Dispatches a notification to the user
 * Compatible with Apple iOS 16.4+ PWA ServiceWorker showNotification and fallback desktop
 */
export async function sendLocalNotification(title: string, options?: NotificationOptions): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  const notificationOptions: NotificationOptions = {
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    ...options
  };

  // 1. Primary method: Service Worker registration (Required by iOS 16.4+ WebKit)
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, notificationOptions);
        return;
      }
    } catch (swErr) {
      console.warn('[Notification] ServiceWorker showNotification falhou, tentando fallback:', swErr);
    }
  }

  // 2. Fallback method: Direct Notification constructor (Desktop Chrome/Firefox)
  try {
    new Notification(title, notificationOptions);
  } catch (directErr) {
    console.warn('[Notification] new Notification falhou:', directErr);
  }
}

/**
 * Sends an immediate test notification to verify audio, vibration, and banner on iOS/Android
 */
export async function sendTestNotification(): Promise<boolean> {
  const granted = await requestNotificationPermission();
  if (!granted) return false;

  await sendLocalNotification('🎉 Notificações Ativadas no OrganoCasa!', {
    body: 'Seu celular está pronto para receber alertas de compras e lembretes da casa.',
    tag: 'organocasa-test-notification'
  });

  return true;
}
