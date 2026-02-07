import { Button } from "./ui/button";
import { Eye, Navigation, Mic, Smartphone, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

interface HomePageProps {
  onNavigate: (page: 'signup' | 'login') => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="min-h-screen bg-black">
      {/* Navigation Header */}
      <motion.header 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="border-b border-white/10 bg-black/80 backdrop-blur-sm sticky top-0 z-10"
      >
        <div className="container mx-auto px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2.5 rounded-xl backdrop-blur-sm">
              <Eye className="size-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">DWS</h1>
          </div>
          <nav className="flex gap-3">
            <Button 
              variant="ghost" 
              onClick={() => onNavigate('login')}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              Login
            </Button>
            <Button 
              onClick={() => onNavigate('signup')} 
              className="bg-white text-black hover:bg-white/90"
            >
              Sign Up
            </Button>
          </nav>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="w-full py-20 bg-black border-b border-white/10">
        <div className="container mx-auto px-8">
          <div className="grid lg:grid-cols-1 gap-12 items-center">
            {/* Text content */}
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="text-center"
            >
              <h2 className="text-6xl font-bold mb-6 text-white">
                Digital Walking Stick
              </h2>
              <h3 className="text-2xl mb-8 text-white/60">
                Navigate indoor spaces with confidence - guided by conversation.
              </h3>
              <div className="flex gap-4 justify-center">
                <Button 
                  size="lg" 
                  onClick={() => onNavigate('signup')} 
                  className="bg-white text-black hover:bg-white/90 px-8"
                >
                  Get Started
                </Button>
                <Button 
                  size="lg" 
                  variant="outline" 
                  onClick={() => onNavigate('login')} 
                  className="border-white/20 text-white hover:bg-white/10 bg-transparent"
                >
                  Sign In
                </Button>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* About Us Section */}
      <section className="container mx-auto px-8 py-20 bg-black">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="max-w-4xl mx-auto text-center"
        >
          <h3 className="text-4xl font-bold mb-8 text-white">
            About Us
          </h3>
          <p className="text-xl text-white/60 leading-relaxed">
            We're creating a voice-first indoor navigation assistant that helps visually impaired users move safely through complex indoor environments. Built with a focus on accessibility, intelligence, and real-world usability, our goal is to make indoor spaces more inclusive through calm, adaptive guidance.
          </p>
        </motion.div>
      </section>

      {/* The Problem Section */}
      <section className="container mx-auto px-8 py-20 bg-white/5 border-y border-white/10">
        <div className="max-w-4xl mx-auto">
          <motion.h3 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ margin: "-100px" }}
            transition={{ duration: 0.6 }}
            className="text-4xl font-bold text-center mb-12 text-white"
          >
            The Problem
          </motion.h3>
          <div className="space-y-6">
            {[
              "GPS-based navigation systems are ineffective in indoor environments",
              "Reliable navigation assistance is often inconsistent or unavailable",
              "Obstacles, dynamic surroundings, and crowded spaces increase safety risks",
              "Independent navigation inside buildings remains a significant challenge"
            ].map((text, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ margin: "-50px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex gap-4 items-start bg-black rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all"
              >
                <AlertCircle className="size-6 flex-shrink-0 mt-1 text-white/70" />
                <p className="text-lg text-white/70">
                  {text}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="container mx-auto px-8 py-20 bg-black">
        <motion.h3 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-4xl font-bold text-center mb-12 text-white"
        >
          Key Features
        </motion.h3>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: Mic, title: "Voice Interaction", desc: "Natural voice commands for hands-free navigation and assistance throughout your journey." },
            { icon: Eye, title: "Computer Vision", desc: "Advanced AI-powered visual recognition to identify obstacles, objects, and surroundings." },
            { icon: Navigation, title: "Real-Time Navigation", desc: "Precise indoor navigation with step-by-step audio guidance to reach your destination safely." },
            { icon: Smartphone, title: "Spatial Awareness", desc: "Intelligent spatial mapping to understand your environment and provide context-aware assistance." }
          ].map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ margin: "-50px" }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all group"
              >
                <div className="bg-white/5 p-3 rounded-lg mb-4 inline-block group-hover:bg-white/10 transition-colors">
                  <Icon className="size-8 text-white/70" />
                </div>
                <h4 className="text-xl font-semibold mb-3 text-white">{feature.title}</h4>
                <p className="text-white/60">
                  {feature.desc}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-white py-8 mt-0 bg-black border-t border-white/10">
        <div className="container mx-auto px-8 text-center">
          <p className="text-white/50">
            © 2026 Digital Walking Stick. Empowering independence through technology.
          </p>
        </div>
      </footer>
    </div>
  );
}