import { useState } from "react";
import { HomePage } from "./components/HomePage";
import { SignUpPage } from "./components/SignUpPage";
import { LoginPage } from "./components/LoginPage";
import { Dashboard } from "./components/Dashboard";

type Page = 'home' | 'signup' | 'login';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleSignUpSuccess = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentPage('home');
  };

  // If user is authenticated, show dashboard regardless of page
  if (isAuthenticated) {
    return (
      <div className="size-full">
        <Dashboard onLogout={handleLogout} />
      </div>
    );
  }

  // Otherwise show the authentication flow
  return (
    <div className="size-full">
      {currentPage === 'home' && (
        <HomePage onNavigate={setCurrentPage} />
      )}
      {currentPage === 'signup' && (
        <SignUpPage 
          onNavigate={setCurrentPage} 
          onSignUpSuccess={handleSignUpSuccess}
        />
      )}
      {currentPage === 'login' && (
        <LoginPage 
          onNavigate={setCurrentPage}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
    </div>
  );
}
