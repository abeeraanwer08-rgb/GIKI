import * as Haptics from 'expo-haptics';

/** Fire-and-forget; haptics are unavailable on web and some devices, so never throw. */
function run(effect: () => Promise<void>): void {
  effect().catch(() => undefined);
}

export const haptics = {
  tap: () => run(() => Haptics.selectionAsync()),
  press: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
