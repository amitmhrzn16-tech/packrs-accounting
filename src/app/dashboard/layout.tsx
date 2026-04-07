import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ChatWidget from "@/components/ChatWidget";
import NotificationBell from "@/components/NotificationBell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  return (
    <>
      {children}
      <NotificationBell />
      <ChatWidget
        currentUserId={session.user?.id || ""}
        currentUserName={session.user?.name || "You"}
      />
    </>
  );
}
