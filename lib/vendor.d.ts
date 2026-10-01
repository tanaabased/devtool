declare module 'valid-path' {
  export default function validPath(path: string, options?: { simpleReturn?: boolean }): boolean;
}
declare module 'string-argv' {
  export default function parseArgsStringToArgv(command: string): string[];
}
declare module 'dockerfile-generator/lib/dockerGenerator.js' {
  export function generateDockerFileFromArray(instructions: Record<string, unknown>[]): string;
}

declare module '*.sh' {
  const file: string;
  export default file;
}
