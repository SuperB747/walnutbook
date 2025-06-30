declare module 'ofx';
declare module 'qif2json';

// Make the Tauri JS API available on the window object
declare global {
  interface Window {
    __TAURI__: any;
  }
} 