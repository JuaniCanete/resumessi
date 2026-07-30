declare module 'authenticator' {
  export function generateToken(formattedKey: string): string;
  export function generateKey(): string;
  export function generateURI(formattedKey: string, accountName: string, issuer: string): string;
}
