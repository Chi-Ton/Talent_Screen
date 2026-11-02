import { apiRequest } from "@/lib/api-client";

export type LoginResponse = {
  accessToken: string;
  tokenType: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    roles: string[];
  };
};

export function login(email: string, password: string) {
  return apiRequest<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
}

