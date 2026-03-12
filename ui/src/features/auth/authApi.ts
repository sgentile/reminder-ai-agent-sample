import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

interface AuthRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  access_token: string;
  token_type: string;
}

interface RegisterResponse {
  message: string;
}

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({ baseUrl: API_URL }),
  endpoints: (builder) => ({
    login: builder.mutation<LoginResponse, AuthRequest>({
      query: (body) => ({ url: "/auth/login", method: "POST", body }),
    }),
    register: builder.mutation<RegisterResponse, AuthRequest>({
      query: (body) => ({ url: "/auth/register", method: "POST", body }),
    }),
  }),
});

export const { useLoginMutation, useRegisterMutation } = authApi;
