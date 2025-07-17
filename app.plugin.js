const withCallx = require('./plugin/build');

/**
 * A config plugin for configuring Callx - React Native incoming call UI library
 *
 * @param {Object} config - Expo config
 * @param {Object} props - Plugin props
 * @param {string} [props.mode='native'] - Mode: 'native' (adds FCM service) or 'js' (no service)
 */
module.exports = (config, props = {}) => {
  return withCallx(config, props);
};
