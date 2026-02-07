import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Eye } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

interface SignUpPageProps {
  onNavigate: (page: 'home' | 'login') => void;
  onSignUpSuccess: () => void;
}

export function SignUpPage({ onNavigate, onSignUpSuccess }: SignUpPageProps) {
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle sign up logic here
    console.log('Sign up:', formData);
    // Simulate successful sign up
    onSignUpSuccess();
  };

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Navigation Header */}
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-sm">
        <div className="container mx-auto px-8 py-5 flex justify-between items-center">
          <button 
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            <div className="bg-white/10 p-2.5 rounded-xl backdrop-blur-sm">
              <Eye className="size-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">DWS</h1>
          </button>
          <Button 
            variant="ghost" 
            onClick={() => onNavigate('login')}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            Already have an account?
          </Button>
        </div>
      </header>

      {/* Sign Up Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
        >
          <div className="px-8 py-6 border-b border-white/10 text-center">
            <h2 className="text-3xl font-bold text-white mb-2">Create an Account</h2>
            <p className="text-white/60">
              Join DWS and experience independence through technology
            </p>
          </div>
          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-white/80">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  required
                  className="bg-black border-white/20 text-white placeholder:text-white/40 focus:border-white/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/80">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="bg-black border-white/20 text-white placeholder:text-white/40 focus:border-white/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/80">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="bg-black border-white/20 text-white placeholder:text-white/40 focus:border-white/40"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-white/80">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                  className="bg-black border-white/20 text-white placeholder:text-white/40 focus:border-white/40"
                />
              </div>

              <Button 
                type="submit" 
                className="w-full bg-white text-black hover:bg-white/90" 
                size="lg"
              >
                Sign Up
              </Button>

              <p className="text-center text-sm text-white/60">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="text-white hover:text-white/80 font-medium transition-colors"
                >
                  Login
                </button>
              </p>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}