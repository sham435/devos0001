export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
        background: "#080c10",
        color: "#e2e8f0",
      }}>
        {children}
      </body>
    </html>
  )
}
