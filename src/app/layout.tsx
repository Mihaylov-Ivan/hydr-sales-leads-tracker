import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ProjectsProvider } from "@/lib/store";
import Header from "@/components/Header";
import OutstandingSidebar from "@/components/OutstandingSidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hydrogenera Sales Tracker",
  description: "Track electrolyser sales leads from first contact to commissioning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ProjectsProvider>
          <Header />
          <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col gap-16 px-4 pb-16 pt-8 lg:flex-row sm:px-6 xl:px-8">
            <main className="min-w-0 flex-1">{children}</main>
            <OutstandingSidebar />
          </div>
        </ProjectsProvider>
      </body>
    </html>
  );
}
