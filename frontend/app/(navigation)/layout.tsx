'use client';

import { NavigationProvider } from '@/components/navigation/NavigationContext';

// Navigation Layout - Accessibility-optimized, full-screen layout
export default function NavigationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <NavigationProvider>
      <div 
        className="min-h-screen bg-black" 
        role="application" 
        aria-label="Indoor Navigation System"
      >
        {children}
      </div>
    </NavigationProvider>
  );
}
