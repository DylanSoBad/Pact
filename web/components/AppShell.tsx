export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="@container mx-auto flex min-h-screen w-full max-w-full flex-col bg-background text-on-background">
      {children}
    </div>
  )
}
