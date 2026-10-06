import "./globals.css"; import type { Metadata } from "next"; import { ToastProvider } from "@/components/ui";
export const metadata: Metadata = { title: "ACM SIGGRAPH Hackathon Attendance", description: "Admin attendance management" };
export default function Root({ children }: { children: React.ReactNode }) { return <html lang="en"><body><ToastProvider>{children}</ToastProvider></body></html>; }
