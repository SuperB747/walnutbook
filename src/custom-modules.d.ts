

// Make the Tauri JS API available on the window object
declare global {
  interface Window {
    __TAURI__: {
      invoke<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T>;
    };
  }
}

// Declare the invoke function from @tauri-apps/api
declare function invoke<T = any>(cmd: string, args?: Record<string, unknown>): Promise<T>; 