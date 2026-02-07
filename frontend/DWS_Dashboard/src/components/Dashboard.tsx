import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Eye, LogOut, MapPin, Activity, Navigation, Users, Clock, Wifi } from "lucide-react";
import { motion } from "framer-motion";

interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  return (
    <div className="min-h-screen bg-black">
      {/* Navigation Header */}
      <header className="border-b border-white/10 bg-black sticky top-0 z-10">
        <div className="container mx-auto px-8 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white/10 p-2.5 rounded-xl backdrop-blur-sm">
              <Eye className="size-6 text-white" />
            </div>
            <div>
              <p className="text-xs text-white/50 uppercase tracking-wider">Dashboard</p>
              <h1 className="text-xl font-bold text-white">Digital Walking Stick</h1>
            </div>
          </div>
          <Button 
            variant="ghost" 
            onClick={onLogout}
            className="text-white/70 hover:text-white hover:bg-white/10"
          >
            <LogOut className="size-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="container mx-auto px-8 py-8">
        {/* Status Bar */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 flex items-center justify-between"
        >
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Navigation Dashboard</h2>
            <p className="text-white/50">Real-time tracking and spatial awareness</p>
          </div>
          <div className="flex gap-3">
            <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/10">
              <div className="flex items-center gap-2">
                <span className="size-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-sm text-white/70">System Active</span>
              </div>
            </div>
            <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/10">
              <div className="flex items-center gap-2">
                <Wifi className="size-4 text-blue-400" />
                <span className="text-sm text-white/70">Connected</span>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Live Video Feed - Takes up 2 columns on larger screens */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="lg:col-span-2 order-1"
          >
            <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                      <Eye className="size-5 text-white/70" />
                      Live Video Feed
                    </h3>
                    <p className="text-sm text-white/50 mt-0.5">Real-time computer vision</p>
                  </div>
                  <div className="bg-red-500/20 text-red-400 px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border border-red-500/30">
                    <span className="size-2 bg-red-400 rounded-full animate-pulse"></span>
                    LIVE
                  </div>
                </div>
              </div>
              <div className="p-6">
                <div className="w-full h-[400px] bg-black rounded-xl flex items-center justify-center relative overflow-hidden border border-white/10">
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                  <div className="text-center relative z-10">
                    <Eye className="size-16 text-white/20 mx-auto mb-3" />
                    <p className="text-white/60">Camera feed initializing...</p>
                  </div>
                  {/* Overlay indicators */}
                  <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                    <div className="bg-black/80 backdrop-blur-sm text-green-400 px-3 py-1.5 rounded-md text-xs font-medium border border-green-500/30">
                      AI Detection: Active
                    </div>
                    <div className="bg-black/80 backdrop-blur-sm text-blue-400 px-3 py-1.5 rounded-md text-xs font-medium border border-blue-500/30">
                      Objects: 0
                    </div>
                    <div className="bg-black/80 backdrop-blur-sm text-purple-400 px-3 py-1.5 rounded-md text-xs font-medium border border-purple-500/30">
                      FPS: 30
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Map View - Top right */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="lg:col-span-1 order-2"
          >
            <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <MapPin className="size-5 text-white/70" />
                  Map View
                </h3>
                <p className="text-sm text-white/50 mt-0.5">Spatial mapping</p>
              </div>
              <div className="p-6">
                <div className="w-full h-[400px] bg-black rounded-xl flex items-center justify-center border border-white/10 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5" />
                  <div className="text-center relative z-10">
                    <MapPin className="size-16 text-white/20 mx-auto mb-3" />
                    <p className="text-white/60">Loading map data...</p>
                  </div>
                  {/* Status */}
                  <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm text-yellow-400 px-3 py-1.5 rounded-md text-xs font-medium border border-yellow-500/30">
                    GPS: Searching
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Analytics Section - Bottom spanning all columns */}
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="lg:col-span-3 order-3"
          >
            <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Activity className="size-5 text-white/70" />
                  Analytics
                </h3>
                <p className="text-sm text-white/50 mt-0.5">Track your navigation metrics</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Total Distance */}
                  <div className="bg-black rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all group">
                    <div className="flex items-start justify-between mb-6">
                      <div className="bg-white/5 p-3 rounded-lg group-hover:bg-white/10 transition-colors">
                        <Navigation className="size-6 text-white/70" />
                      </div>
                      <Clock className="size-4 text-white/30" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-white/50 uppercase tracking-wide">Total Distance</p>
                      <p className="text-4xl font-bold text-white">2.4 km</p>
                      <div className="flex items-center gap-2 mt-3">
                        <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full w-3/4 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"></div>
                        </div>
                        <span className="text-xs text-green-400">+12%</span>
                      </div>
                      <p className="text-xs text-white/40 mt-2">This week</p>
                    </div>
                  </div>
                  
                  {/* Active Sessions */}
                  <div className="bg-black rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all group">
                    <div className="flex items-start justify-between mb-6">
                      <div className="bg-white/5 p-3 rounded-lg group-hover:bg-white/10 transition-colors">
                        <Activity className="size-6 text-white/70" />
                      </div>
                      <Clock className="size-4 text-white/30" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-white/50 uppercase tracking-wide">Active Sessions</p>
                      <p className="text-4xl font-bold text-white">12</p>
                      <div className="flex items-center gap-2 mt-3">
                        <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full w-1/2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full"></div>
                        </div>
                        <span className="text-xs text-blue-400">Active</span>
                      </div>
                      <p className="text-xs text-white/40 mt-2">Today • 3 in progress</p>
                    </div>
                  </div>
                  
                  {/* Mapped Locations */}
                  <div className="bg-black rounded-xl p-6 border border-white/10 hover:border-white/20 transition-all group">
                    <div className="flex items-start justify-between mb-6">
                      <div className="bg-white/5 p-3 rounded-lg group-hover:bg-white/10 transition-colors">
                        <Users className="size-6 text-white/70" />
                      </div>
                      <Clock className="size-4 text-white/30" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-white/50 uppercase tracking-wide">Mapped Locations</p>
                      <p className="text-4xl font-bold text-white">5</p>
                      <div className="flex items-center gap-2 mt-3">
                        <div className="h-1 flex-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full w-2/3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                        </div>
                        <span className="text-xs text-purple-400">Growing</span>
                      </div>
                      <p className="text-xs text-white/40 mt-2">Buildings • Updated 2h ago</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}