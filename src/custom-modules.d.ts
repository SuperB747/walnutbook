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

declare module '*.png' {
  const value: string;
  export default value;
}

declare module 'path-browserify' {
  export function resolve(...paths: string[]): string;
  export function join(...paths: string[]): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;
  export function normalize(path: string): string;
  export function isAbsolute(path: string): boolean;
  export function relative(from: string, to: string): string;
  export function parse(pathString: string): {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
  };
  export function format(pathObject: {
    root?: string;
    dir?: string;
    base?: string;
    ext?: string;
    name?: string;
  }): string;
  export const sep: string;
  export const delimiter: string;
  export const posix: typeof import('path-browserify');
  export const win32: typeof import('path-browserify');
} 