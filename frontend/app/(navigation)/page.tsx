import BrailleScanner from "@/components/navigation/BrailleScanner";

export const metadata = {
  title: "Braille Scanner - CXC Navigation",
  description: "Scan and read braille text using your camera",
};

export default function NavigationPage() {
  return (
    <main className="navigation-page">
      <header className="navigation-page__header">
        <div className="navigation-page__header-inner">
          <div className="navigation-page__logo">
            <svg width="28" height="28" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="25" cy="20" r="6" fill="currentColor" opacity="0.9" />
              <circle cx="45" cy="20" r="6" fill="currentColor" opacity="0.4" />
              <circle cx="25" cy="40" r="6" fill="currentColor" opacity="0.9" />
              <circle cx="45" cy="40" r="6" fill="currentColor" opacity="0.9" />
              <circle cx="25" cy="60" r="6" fill="currentColor" opacity="0.4" />
              <circle cx="45" cy="60" r="6" fill="currentColor" opacity="0.9" />
            </svg>
            <h1 className="navigation-page__title">CXC Navigator</h1>
          </div>
          <a href="/dashboard" className="navigation-page__back-link">
            Dashboard
          </a>
        </div>
      </header>

      <section className="navigation-page__content">
        <BrailleScanner />
      </section>

      <footer className="navigation-page__footer">
        <p>
          Powered by Gemini Vision + ElevenLabs TTS
        </p>
      </footer>
    </main>
  );
}
