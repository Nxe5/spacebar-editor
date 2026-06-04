export type User = {
  id: string;
  email: string;
  role: "admin" | "member";
};

export function isAdmin(user: User): boolean {
  return user.role === "admin";
}

export function validateEmail(email: string): boolean {
  return email.includes("@") && email.includes(".");
}
