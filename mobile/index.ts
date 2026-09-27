import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';

// Module scope, before the app mounts, and deliberately so: Android runs this
// task in a headless JS context when a notification action is tapped while the
// app is terminated, and a task defined inside a component would not exist yet.
// iOS handles the same taps natively — see modules/notification-actions — because
// no equivalent hook survives a killed app there.
//
// Required inside the branch rather than imported at the top so that neither
// iOS nor web pays to load a task runtime it will never register anything with.
if (Platform.OS === 'android') {
  const { NOTIFICATION_ACTION_TASK, defineNotificationActionTask } = require('./src/data/notificationActionTask');
  const Notifications = require('expo-notifications');
  defineNotificationActionTask();
  Notifications.registerTaskAsync(NOTIFICATION_ACTION_TASK).catch(() => {});
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
