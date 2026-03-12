import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { RootState } from "../../app/store";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8001";

export interface Reminder {
  id: number;
  description: string;
  due_time: string;
  recurring: boolean;
  interval_seconds: number | null;
  notified: boolean;
}

export interface UserSettings {
  timezone: string | null;
}

export const reminderApi = createApi({
  reducerPath: "reminderApi",
  baseQuery: fetchBaseQuery({
    baseUrl: API_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = (getState() as RootState).auth.token;
      if (token) headers.set("Authorization", `Bearer ${token}`);
      return headers;
    },
  }),
  tagTypes: ["Reminder", "Settings"],
  endpoints: (builder) => ({
    getReminders: builder.query<Reminder[], void>({
      query: () => "/reminders",
      providesTags: ["Reminder"],
    }),
    deleteReminder: builder.mutation<void, number>({
      query: (id) => ({ url: `/reminders/${id}`, method: "DELETE" }),
      invalidatesTags: ["Reminder"],
    }),
    getSettings: builder.query<UserSettings, void>({
      query: () => "/settings",
      providesTags: ["Settings"],
    }),
  }),
});

export const {
  useGetRemindersQuery,
  useDeleteReminderMutation,
  useGetSettingsQuery,
} = reminderApi;
