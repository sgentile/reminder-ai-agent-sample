import { configureStore } from "@reduxjs/toolkit";
import { authApi } from "../features/auth/authApi";
import authReducer from "../features/auth/authSlice";
import { reminderApi } from "../features/reminders/reminderApi";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    [authApi.reducerPath]: authApi.reducer,
    [reminderApi.reducerPath]: reminderApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware()
      .concat(authApi.middleware)
      .concat(reminderApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
