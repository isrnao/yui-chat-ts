import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

if (typeof global.Intl === 'undefined') {
  // Hermes should ship with Intl, but load lightweight polyfills just in case.
  require('@formatjs/intl-getcanonicallocales/polyfill');
  require('@formatjs/intl-locale/polyfill');
  require('@formatjs/intl-pluralrules/polyfill');
  require('@formatjs/intl-datetimeformat/polyfill');
  require('@formatjs/intl-datetimeformat/add-all-tz');
}
