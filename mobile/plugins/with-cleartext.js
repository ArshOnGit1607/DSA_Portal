/**
 * Lets a release APK call an http:// API (a laptop on the LAN or the emulator's 10.0.2.2) for demos.
 * Off unless DSA_ALLOW_HTTP=1 at prebuild time: production builds stay HTTPS-only (Android's default).
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartext(config) {
  if (process.env.DSA_ALLOW_HTTP !== '1') return config;
  return withAndroidManifest(config, (c) => {
    c.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
    return c;
  });
};
