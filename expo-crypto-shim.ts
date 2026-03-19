// Crypto polyfill for WalletConnect
import 'react-native-get-random-values';

// This file must be imported at the very top of your entry file
if (typeof global.crypto === 'undefined') {
  (global as any).crypto = {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  };
}
