import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="auth-page">
      <div className="grid-overlay" />
      <div className="auth-glow" />

      <div className="auth-content" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2rem" }}>
        {/* Logo */}
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontWeight: 700, fontSize: "1.5rem" }}>
          <div className="logo-icon">
            <i className="fas fa-eye" />
          </div>
          <span className="logo-text">DWS</span>
        </Link>

        <SignIn
          afterSignOutUrl="/"
          forceRedirectUrl="/dashboard"
          signUpUrl="/signUp"
          appearance={{
            elements: {
              rootBox: "w-full max-w-md",
              card: "bg-[#121a17] border border-[rgba(191,200,195,0.1)] shadow-xl rounded-xl",
              headerTitle: "text-[#f2f4f3]",
              headerSubtitle: "text-[#bfc8c3]",
              formFieldLabel: "text-[#bfc8c3]",
              formFieldInput:
                "bg-[#1a2420] border-[rgba(191,200,195,0.15)] text-[#f2f4f3] focus:border-[#bfc8c3] focus:ring-[rgba(191,200,195,0.2)]",
              formButtonPrimary:
                "bg-gradient-to-r from-[#d5dbd8] to-[#bfc8c3] text-[#0a0e0c] hover:opacity-90 font-semibold",
              footerActionLink: "text-[#c8d5cf] hover:text-[#f2f4f3]",
              identityPreviewText: "text-[#bfc8c3]",
              identityPreviewEditButton: "text-[#c8d5cf]",
              socialButtonsBlockButton:
                "bg-[#1a2420] border-[rgba(191,200,195,0.12)] text-[#f2f4f3] hover:bg-[#1e2a26]",
              socialButtonsBlockButtonText: "text-[#f2f4f3]",
              dividerLine: "bg-[rgba(191,200,195,0.12)]",
              dividerText: "text-[#87948d]",
              formFieldInputShowPasswordButton: "text-[#87948d] hover:text-[#bfc8c3]",
              alertText: "text-[#fca5a5]",
              footer: "hidden",
            },
          }}
        />

        <p style={{ fontSize: "0.875rem", color: "var(--color-text-muted)" }}>
          Don&apos;t have an account?{" "}
          <Link href="/signUp" style={{ color: "var(--color-primary-400)", fontWeight: 500 }}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
