import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Eye } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

interface LoginPageProps {
  onNavigate: (page: 'home' | 'signup') => void;
  onLoginSuccess: () => void;
}

export function LoginPage({ onNavigate, onLoginSuccess }: LoginPageProps) {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle login logic here
    console.log('Login:', formData);
    // Simulate successful login
    onLoginSuccess();
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
            onClick={() => onNavigate('signup')}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            Need an account?
          </Button>
        </div>
      </header>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
        >
          <div className="px-8 py-6 border-b border-white/10 text-center">
            <h2 className="text-3xl font-bold text-white mb-2">Welcome Back</h2>
            <p className="text-white/60">
              Sign in to access your DWS assistant
            </p>
          </div>
          <div className="p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
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
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="bg-black border-white/20 text-white placeholder:text-white/40 focus:border-white/40"
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" className="rounded bg-black border-white/20" />
                  <span className="text-white/60">Remember me</span>
                </label>
                <button
                  type="button"
                  className="text-white/80 hover:text-white font-medium transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-white text-black hover:bg-white/90" 
                size="lg"
              >
                Login
              </Button>

              <p className="text-center text-sm text-white/60">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => onNavigate('signup')}
                  className="text-white hover:text-white/80 font-medium transition-colors"
                >
                  Sign up
                </button>
              </p>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}