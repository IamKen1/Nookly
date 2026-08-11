import { after } from "next/server";

export const runInBackground = (label: string, task: () => Promise<unknown>) => {
  after(async () => {
    try {
      await task();
    } catch (error) {
      console.error(`[background] ${label} failed:`, error);
    }
  });
};
