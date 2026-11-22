// Jest stand-in for @teamhanko/hanko-elements, whose browser bundle does not load under CRA's Jest.
export class Hanko {
  getSessionToken() { return undefined; }
  onSessionCreated() { return () => {}; }
  get user() { return { logout: async () => {}, delete: async () => {} }; }
  get session() { return { getToken: () => undefined }; }
}
export const register = () => Promise.resolve();
