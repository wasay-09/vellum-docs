/**
 * Client-safe list of the seeded demo accounts. The assignment allows mocked auth,
 * so the reviewer can one-click into any of these on the login screen.
 */
export const DEMO_PASSWORD = "demo1234";

export interface DemoUser {
  email: string;
  name: string;
  accent: string;
  blurb: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    email: "alice@ajaia.test",
    name: "Alice Nguyen",
    accent: "indigo",
    blurb: "Owns “Welcome to Vellum”, shared with Bob as an editor",
  },
  {
    email: "bob@ajaia.test",
    name: "Bob Mensah",
    accent: "emerald",
    blurb: "Owns a draft shared with Alice as a viewer",
  },
  {
    email: "carol@ajaia.test",
    name: "Carol Diaz",
    accent: "amber",
    blurb: "Shares nothing — proves documents stay private",
  },
];
