"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function LandingPage() {
  // Scroll animations
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("visible");
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".animate-on-scroll").forEach((el) => observer.observe(el));

    // Navbar scroll effect
    const navbar = document.getElementById("navbar");
    const onScroll = () => {
      if (!navbar) return;
      if (window.scrollY > 50) navbar.classList.add("scrolled");
      else navbar.classList.remove("scrolled");
    };
    window.addEventListener("scroll", onScroll);

    // Path animation restart
    const pathEl = document.querySelector(".path-animation") as SVGPathElement | null;
    if (pathEl) {
      const pathObs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              pathEl.style.animation = "none";
              void (pathEl as unknown as HTMLElement).offsetHeight; // reflow
              pathEl.style.animation = "drawPath 3s ease forwards";
            }
          });
        },
        { threshold: 0.5 }
      );
      pathObs.observe(pathEl);
    }

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, []);

  return (
    <>
      {/* ── NAVBAR ── */}
      <nav className="navbar" id="navbar">
        <div className="navbar-inner">
          <Link href="/" className="logo">
            <div className="logo-icon">
              <i className="fas fa-eye" />
            </div>
            <span className="logo-text">DWS</span>
          </Link>

          <ul className="nav-links">
            <li><a href="#features" className="nav-link">Features</a></li>
            <li><a href="#tech" className="nav-link">Technology</a></li>
            <li><a href="#how-it-works" className="nav-link">How It Works</a></li>
            <li><a href="#architecture" className="nav-link">Architecture</a></li>
            <li><a href="#demo" className="nav-link">Demo</a></li>
          </ul>

          <div className="nav-actions">
            <Link href="/signIn" className="btn btn-ghost">Login</Link>
            <Link href="/signUp" className="btn btn-primary">Get Started</Link>
          </div>

          <button className="menu-toggle" aria-label="Toggle menu">
            <span /><span /><span />
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg">
          <div className="hero-glow" />
          <div className="grid-overlay" />
        </div>

        <div className="hero-content">
          <div className="hero-text">
            <div className="hero-badge">
              <span className="dot" />
              <span>Now in Beta — University of Waterloo</span>
            </div>

            <h1 className="hero-title">
              Navigate indoors<br />
              with <span className="highlight">confidence</span>
            </h1>

            <p className="hero-description">
              DWS is a voice-first indoor navigation assistant that combines real-time
              computer vision, AI-powered scene understanding, and intelligent pathfinding
              to guide visually impaired users through complex indoor environments.
            </p>

            <div className="hero-cta">
              <a href="#demo" className="btn btn-primary btn-large">
                <i className="fas fa-play" /> Watch Demo
              </a>
              <a href="#architecture" className="btn btn-outline btn-large">
                <i className="fas fa-code" /> View Architecture
              </a>
            </div>
          </div>

          <div className="hero-visual">
            <div className="phone-mockup">
              <div className="phone-frame">
                <div className="phone-screen">
                  <div className="phone-notch" />
                  <div className="camera-preview">
                    <div className="camera-feed" />
                    <div className="depth-overlay" />
                    <div className="bounding-box bounding-box-1">
                      <span className="bbox-label">person 0.94</span>
                    </div>
                    <div className="bounding-box bounding-box-2">
                      <span className="bbox-label" style={{ background: "var(--color-accent-sage)" }}>chair 0.87</span>
                    </div>
                  </div>
                  <div className="phone-ui">
                    <div className="status-bar">
                      <div className="connection-status">
                        <span className="indicator" />
                        <span>Connected</span>
                      </div>
                      <div className="fps-counter">12 FPS · 45ms RTT</div>
                    </div>
                    <div className="instruction-card">
                      <div className="instruction-text">
                        <i className="fas fa-arrow-up" style={{ color: "var(--color-primary-400)" }} />{" "}
                        Chair ahead. Pass on your left.
                      </div>
                      <div className="instruction-meta">YOLOv8n · MiDaS · 1.2m distance</div>
                    </div>
                    <div className="phone-controls">
                      <button className="phone-btn"><i className="fas fa-microphone" /></button>
                      <button className="phone-btn primary"><i className="fas fa-camera" /></button>
                      <button className="phone-btn"><i className="fas fa-map" /></button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="floating-badge yolo"><i className="fas fa-bolt" /><span>YOLOv8n 30-50ms</span></div>
              <div className="floating-badge midas"><i className="fas fa-layer-group" /><span>MiDaS Depth</span></div>
              <div className="floating-badge gemini"><i className="fas fa-brain" /><span>Gemini 2.0 Flash</span></div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="features" id="features">
        <div className="container">
          <div className="section-header animate-on-scroll">
            <div className="section-label"><i className="fas fa-star" /> Core Capabilities</div>
            <h2 className="section-title">Built for <span className="gradient-text">independence</span></h2>
            <p className="section-description">
              Every feature designed with accessibility at its core. From real-time obstacle detection
              to voice-guided navigation, DWS empowers users to navigate confidently.
            </p>
          </div>

          <div className="features-grid">
            {[
              { icon: "fa-microphone-lines", title: "Voice Interaction", desc: "Natural voice commands for hands-free navigation. Simply say \"I'm in room 0020, take me to room 0010\" and DWS handles the rest." },
              { icon: "fa-eye", title: "Computer Vision", desc: "YOLOv8n detects objects in 30-50ms while MiDaS estimates depth. Combined, they identify obstacles and calculate safe passage routes." },
              { icon: "fa-route", title: "Real-Time Navigation", desc: "Graph-based pathfinding with Dijkstra's algorithm computes optimal routes through 23 rooms and 34 hallway waypoints in milliseconds." },
              { icon: "fa-brain", title: "Scene Understanding", desc: "Gemini 2.0 Flash analyzes the full scene — not just objects, but environment, hallway layout, signage, and spatial relationships." },
            ].map((f, i) => (
              <div key={i} className={`feature-card animate-on-scroll stagger-${i + 1}`}>
                <div className="feature-icon"><i className={`fas ${f.icon}`} /></div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-description">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section className="tech-stack" id="tech">
        <div className="tech-bg" />
        <div className="container tech-content">
          <div className="section-header animate-on-scroll">
            <div className="section-label"><i className="fas fa-layer-group" /> Technology Stack</div>
            <h2 className="section-title">Powered by <span className="gradient-text">cutting-edge AI</span></h2>
            <p className="section-description">
              A modern full-stack architecture combining the best of computer vision,
              machine learning, and web technologies.
            </p>
          </div>

          <div className="tech-grid">
            <div className="animate-on-scroll" style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
              {[
                { icon: "fa-server", title: "FastAPI Backend", desc: "High-performance Python async framework with WebSocket video streaming, ML inference offloading to thread pool, and backpressure-controlled frame processing", tags: ["Python 3.11", "AsyncIO", "WebSockets", "Thread Pool"] },
                { icon: "fa-desktop", title: "Next.js 16 Frontend", desc: "React 19 with TypeScript, Tailwind CSS 4, App Router, dynamic imports for code-splitting heavy components like CameraStream and FloorPlanMap", tags: ["React 19", "TypeScript", "Tailwind 4", "Clerk Auth"] },
                { icon: "fa-robot", title: "ML Pipeline", desc: "YOLOv8n for real-time object detection (80 COCO classes, indoor-filtered), MiDaS Small for monocular depth estimation with 1.5s cooldown, Gemini 2.0 Flash for multimodal scene reasoning", tags: ["Ultralytics", "Intel ISL", "Google AI", "CUDA/CPU"] },
                { icon: "fa-volume-high", title: "Voice Pipeline", desc: "ElevenLabs eleven_flash_v2_5 neural TTS with streaming MP3 (44100Hz/128kbps), Web Speech API for voice recognition, overlap protection with audio queue management", tags: ["ElevenLabs", "Web Speech API", "SpeechSynthesis"] },
              ].map((t, i) => (
                <div key={i} className={`tech-item animate-on-scroll stagger-${i + 1}`}>
                  <div className="tech-item-icon"><i className={`fas ${t.icon}`} /></div>
                  <div className="tech-item-content">
                    <h4>{t.title}</h4>
                    <p>{t.desc}</p>
                    <div className="tech-tags">
                      {t.tags.map((tag) => <span key={tag} className="tech-tag">{tag}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="animate-on-scroll" style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
              {[
                { icon: "fa-diagram-project", title: "Pathfinding Engine", desc: "Dijkstra's shortest path on a weighted graph built from Gemini Vision analysis of SVG floor plans. Handles room ID normalization (0020, 020, 20 → same room)", tags: ["Dijkstra", "23 Rooms", "34 Nodes", "73 Edges"] },
                { icon: "fa-shield-halved", title: "Obstacle Classifier", desc: "Analyzes center 40% walking corridor. Distance thresholds: danger (<1m, 25% coverage), warning (1-2m, 35%), caution (2-3.5m, 50%). Computes clearance side", tags: ["Corridor Analysis", "Threat Levels", "Clearance"] },
                { icon: "fa-database", title: "Data & Auth", desc: "Supabase for user data and session storage. Clerk for authentication with webhook sync. Cached floor plan analysis in basement_analysis.json", tags: ["Supabase", "Clerk", "JSON Cache", "SVG"] },
                { icon: "fa-gauge-high", title: "Performance", desc: "Adaptive frame rate (5-12 FPS) based on RTT measurement. Backpressure-controlled WebSocket prevents queue buildup. MiDaS runs on cooldown to avoid pipeline blocking", tags: ["Backpressure", "Adaptive FPS", "Cooldown"] },
              ].map((t, i) => (
                <div key={i} className={`tech-item animate-on-scroll stagger-${i + 1}`}>
                  <div className="tech-item-icon"><i className={`fas ${t.icon}`} /></div>
                  <div className="tech-item-content">
                    <h4>{t.title}</h4>
                    <p>{t.desc}</p>
                    <div className="tech-tags">
                      {t.tags.map((tag) => <span key={tag} className="tech-tag">{tag}</span>)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="how-it-works" id="how-it-works">
        <div className="container">
          <div className="section-header animate-on-scroll">
            <div className="section-label"><i className="fas fa-list-ol" /> Process</div>
            <h2 className="section-title">How it <span className="gradient-text">works</span></h2>
            <p className="section-description">
              From camera capture to voice guidance — understand the complete pipeline
              that powers every navigation decision.
            </p>
          </div>

          <div className="steps-container">
            {[
              { num: "01", title: "Camera Capture & Stream", desc: "Phone camera captures frames via getUserMedia, compresses to 240px-wide JPEG at 35% quality, and streams over WebSocket to the backend with backpressure control and adaptive frame rate (5-12 FPS based on RTT).", code: "Frame → JPEG(240px, 35%) → Base64 → WebSocket → Server [backpressure]" },
              { num: "02", title: "Object Detection & Depth", desc: "YOLOv8n runs on every frame (~30-50ms) producing bounding boxes, labels, and confidence scores filtered for 80 COCO indoor classes. MiDaS Small estimates monocular depth on a 1.5s cooldown to avoid pipeline blocking. Distance in meters computed per bounding box.", code: "YOLO: [person: 0.94, chair: 0.87] | MiDaS: depth_map → distance = 2.3m" },
              { num: "03", title: "Obstacle Classification", desc: "Analyzes the center 40% walking corridor (30-70% of frame width). Distance thresholds: danger (<1m, 25% coverage), warning (1-2m, 35%), caution (2-3.5m, 50%). Computes clearance side for safe passage direction.", code: "Threat: WARNING | Coverage: 32% | Pass: LEFT | Distance: 1.8m" },
              { num: "04", title: "AI Scene Reasoning", desc: "Gemini 2.0 Flash receives the frame + detections + navigation context via multimodal API. Reasons about the full scene including environment, layout, signage, and spatial relationships. Retry logic with exponential backoff, fallback to rule-based reasoning.", code: 'Gemini: "Chair ahead in hallway. Pass on your left, wall on your right."' },
              { num: "05", title: "Voice Announcement", desc: "ElevenLabs eleven_flash_v2_5 converts guidance to natural speech (streaming MP3, 44100Hz/128kbps). Fallback to browser SpeechSynthesis if API fails. Overlap protection ensures only one audio stream plays at a time.", code: '🔊 "Chair ahead. Pass on your left." [ElevenLabs → MP3 → AudioElement]' },
            ].map((s, i) => (
              <div key={i} className="step animate-on-scroll">
                <div className="step-number">{s.num}</div>
                <div className="step-content">
                  <h3 className="step-title">{s.title}</h3>
                  <p className="step-description">{s.desc}</p>
                  <div className="step-visual"><code>{s.code}</code></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ARCHITECTURE ── */}
      <section className="architecture" id="architecture">
        <div className="container">
          <div className="section-header animate-on-scroll">
            <div className="section-label"><i className="fas fa-sitemap" /> System Design</div>
            <h2 className="section-title">System <span className="gradient-text">architecture</span></h2>
            <p className="section-description">
              A comprehensive overview of the full-stack architecture — from the React frontend
              to the FastAPI ML pipeline, voice synthesis, and navigation engine.
            </p>
          </div>

          <div className="architecture-diagram animate-on-scroll">
            <div className="arch-layers">
              {/* Frontend */}
              <div className="arch-layer">
                <div className="arch-layer-label">Frontend<br /><span style={{ fontSize: "0.625rem", opacity: 0.6 }}>Next.js 16 · React 19</span></div>
                <div className="arch-components">
                  <div className="arch-component"><i className="fas fa-camera" /><span>CameraStream</span></div>
                  <div className="arch-component"><i className="fas fa-microphone" /><span>VoiceListener</span></div>
                  <div className="arch-component"><i className="fas fa-volume-high" /><span>VoiceSpeaker</span></div>
                  <div className="arch-component"><i className="fas fa-map" /><span>FloorPlanMap</span></div>
                  <div className="arch-component"><i className="fas fa-user" /><span>Clerk Auth</span></div>
                  <div className="arch-component"><i className="fas fa-code" /><span>TypeScript</span></div>
                </div>
              </div>
              <div className="arch-connections"><div className="arch-arrow" /></div>

              {/* API Gateway */}
              <div className="arch-layer">
                <div className="arch-layer-label">API Gateway<br /><span style={{ fontSize: "0.625rem", opacity: 0.6 }}>FastAPI · AsyncIO</span></div>
                <div className="arch-components">
                  <div className="arch-component"><i className="fas fa-video" /><span>/ws/video</span></div>
                  <div className="arch-component"><i className="fas fa-location-arrow" /><span>/navigate</span></div>
                  <div className="arch-component"><i className="fas fa-magnifying-glass" /><span>/detect</span></div>
                  <div className="arch-component"><i className="fas fa-comment-dots" /><span>/announce</span></div>
                  <div className="arch-component"><i className="fas fa-wand-magic-sparkles" /><span>/analyze-and-announce</span></div>
                  <div className="arch-component"><i className="fas fa-heart-pulse" /><span>/health</span></div>
                </div>
              </div>
              <div className="arch-connections"><div className="arch-arrow" /></div>

              {/* ML Pipeline */}
              <div className="arch-layer">
                <div className="arch-layer-label">ML Pipeline<br /><span style={{ fontSize: "0.625rem", opacity: 0.6 }}>Thread Pool Executor</span></div>
                <div className="arch-components">
                  <div className="arch-component"><i className="fas fa-bolt" /><span>YOLOv8n (30-50ms)</span></div>
                  <div className="arch-component"><i className="fas fa-layer-group" /><span>MiDaS Small (1.5s CD)</span></div>
                  <div className="arch-component"><i className="fas fa-crosshairs" /><span>Obstacle Classifier</span></div>
                  <div className="arch-component"><i className="fas fa-brain" /><span>Gemini 2.0 Flash</span></div>
                  <div className="arch-component"><i className="fas fa-route" /><span>Dijkstra Pathfinder</span></div>
                </div>
              </div>
              <div className="arch-connections"><div className="arch-arrow" /></div>

              {/* Voice Pipeline */}
              <div className="arch-layer">
                <div className="arch-layer-label">Voice Pipeline<br /><span style={{ fontSize: "0.625rem", opacity: 0.6 }}>TTS + STT</span></div>
                <div className="arch-components">
                  <div className="arch-component"><i className="fas fa-waveform" /><span>ElevenLabs TTS</span></div>
                  <div className="arch-component"><i className="fas fa-microphone-lines" /><span>Web Speech API</span></div>
                  <div className="arch-component"><i className="fas fa-comment" /><span>SpeechSynthesis</span></div>
                  <div className="arch-component"><i className="fas fa-shield" /><span>Overlap Protection</span></div>
                </div>
              </div>
              <div className="arch-connections"><div className="arch-arrow" /></div>

              {/* Data Layer */}
              <div className="arch-layer">
                <div className="arch-layer-label">Data Layer<br /><span style={{ fontSize: "0.625rem", opacity: 0.6 }}>Storage + Graph</span></div>
                <div className="arch-components">
                  <div className="arch-component"><i className="fas fa-database" /><span>Supabase</span></div>
                  <div className="arch-component"><i className="fas fa-map" /><span>basement_analysis.json</span></div>
                  <div className="arch-component"><i className="fas fa-diagram-project" /><span>Nav Graph (73 edges)</span></div>
                  <div className="arch-component"><i className="fas fa-image" /><span>SVG Floor Plans</span></div>
                  <div className="arch-component"><i className="fas fa-cube" /><span>yolov8n.pt</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PERFORMANCE ── */}
      <section className="performance">
        <div className="container">
          <div className="section-header animate-on-scroll">
            <div className="section-label"><i className="fas fa-gauge-high" /> Performance</div>
            <h2 className="section-title">Built for <span className="gradient-text">speed</span></h2>
            <p className="section-description">
              Optimized at every layer for real-time responsiveness. From model inference
              to network transmission, every millisecond counts.
            </p>
          </div>

          <div className="metrics-grid">
            {[
              { value: "30", unit: "ms", label: "YOLOv8n Inference", sub: "Object Detection" },
              { value: "12", unit: "FPS", label: "Adaptive Frame Rate", sub: "5-12 FPS based on RTT" },
              { value: "23", unit: "", label: "Rooms Mapped", sub: "+ 34 hallway waypoints" },
              { value: "<1", unit: "s", label: "Path Computation", sub: "Dijkstra's algorithm" },
            ].map((m, i) => (
              <div key={i} className={`metric-card animate-on-scroll stagger-${i + 1}`}>
                <div className="metric-value">{m.value}{m.unit && <span style={{ fontSize: "1.5rem" }}>{m.unit}</span>}</div>
                <div className="metric-label">{m.label}</div>
                <div className="metric-sublabel">{m.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEMO ── */}
      <section className="demo" id="demo">
        <div className="container">
          <div className="section-header animate-on-scroll">
            <div className="section-label"><i className="fas fa-play-circle" /> Live Demo</div>
            <h2 className="section-title">See it in <span className="gradient-text">action</span></h2>
            <p className="section-description">
              Watch DWS navigate the Science Teaching Complex basement in real-time,
              from voice command to arrival.
            </p>
          </div>

          <div className="demo-container">
            <div className="demo-visual animate-on-scroll">
              <div className="floorplan-container">
                {/* Actual Waterloo Basement Floor Plan */}
                <div style={{ position: "relative", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                  <img
                    src="/basement-map.jpg"
                    alt="University of Waterloo STC Basement Floor Plan"
                    style={{ width: "100%", borderRadius: "var(--radius-md)", opacity: 0.85 }}
                  />
                  {/* Animated path overlay */}
                  <svg
                    viewBox="0 0 1224 792"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      className="path-animation"
                      d="M 210 270 L 210 180 L 500 180 L 800 180 L 1010 180 L 1010 270"
                      fill="none"
                      stroke="rgba(191,200,195,0.7)"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray="8,4"
                    />
                    <circle cx="210" cy="270" r="8" fill="#86efac" className="beacon" />
                    <circle cx="1010" cy="270" r="8" fill="#fca5a5" className="beacon" />
                  </svg>
                </div>

                <div style={{ marginTop: "var(--space-md)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: "0.875rem", color: "var(--color-text-secondary)" }}>
                    <i className="fas fa-map-marker-alt" style={{ color: "#86efac" }} /> Room 0020
                    <i className="fas fa-arrow-right" style={{ margin: "0 var(--space-sm)" }} />
                    <i className="fas fa-map-marker-alt" style={{ color: "#fca5a5" }} /> Room 0012
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                    Distance: 45m · Waypoints: 5
                  </div>
                </div>
              </div>
            </div>

            <div className="demo-terminal animate-on-scroll">
              <div className="terminal-header">
                <span className="terminal-dot red" />
                <span className="terminal-dot yellow" />
                <span className="terminal-dot green" />
                <span className="terminal-title">dws-session.log</span>
              </div>
              <div className="terminal-body">
                {[
                  { p: "$", text: 'voice_command: "I\'m in room 0020, take me to room 0012"', cls: "terminal-output" },
                  { p: ">", text: "✓ Parsed: start=0020, dest=0012", cls: "terminal-success" },
                  { p: ">", text: "Loading navigation graph...", cls: "terminal-output" },
                  { p: ">", text: "✓ Graph loaded: 23 rooms, 34 waypoints, 73 edges", cls: "terminal-success" },
                  { p: ">", text: "Computing shortest path (Dijkstra)...", cls: "terminal-output" },
                  { p: ">", text: "✓ Path found: 5 waypoints, 45m total", cls: "terminal-success" },
                  { p: ">", text: "Initializing camera stream (WebSocket)...", cls: "terminal-output" },
                  { p: ">", text: "✓ WebSocket connected | Backpressure: ON | FPS: adaptive", cls: "terminal-success" },
                  { p: ">", text: "⚠ YOLOv8n: chair detected (conf: 0.87)", cls: "terminal-warning" },
                  { p: ">", text: "MiDaS depth → 1.8m | Corridor coverage: 32% | Threat: WARNING", cls: "terminal-output" },
                  { p: ">", text: '✓ Gemini: "Chair ahead. Pass on your left."', cls: "terminal-success" },
                  { p: ">", text: '🔊 ElevenLabs TTS → "Chair ahead. Pass on your left."', cls: "terminal-output" },
                  { p: ">", text: "✓ Path clear. Continue forward.", cls: "terminal-success" },
                  { p: ">", text: "Progress: 60% (3/5 waypoints)", cls: "terminal-output" },
                  { p: ">", text: "✓ Arrived at Room 0012", cls: "terminal-success" },
                  { p: ">", text: '🔊 "You have arrived at your destination."', cls: "terminal-output" },
                ].map((line, i) => (
                  <div key={i} className="terminal-line" style={{ animationDelay: `${i * 0.15}s` }}>
                    <span className="terminal-prompt">{line.p}</span>
                    <span className={line.cls}>{line.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="cta">
        <div className="cta-bg" />
        <div className="container">
          <div className="cta-content animate-on-scroll">
            <h2 className="cta-title">Ready to navigate <span className="gradient-text">independently?</span></h2>
            <p className="cta-description">
              DWS is currently in beta at the University of Waterloo.
              Join the waitlist to be among the first to experience voice-first indoor navigation.
            </p>
            <div className="cta-buttons">
              <Link href="/signUp" className="btn btn-primary btn-large">
                <i className="fas fa-rocket" /> Join Waitlist
              </Link>
              <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-large">
                <i className="fab fa-github" /> View on GitHub
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <div className="footer-logo">
                <div className="logo-icon" style={{ width: 32, height: 32 }}>
                  <i className="fas fa-eye" style={{ fontSize: "0.875rem" }} />
                </div>
                <span>DWS</span>
              </div>
              <p className="footer-description">
                Digital Walking Stick — empowering independence through AI-powered
                indoor navigation for visually impaired users.
              </p>
              <div className="footer-social">
                <a href="#" className="social-link" aria-label="GitHub"><i className="fab fa-github" /></a>
                <a href="#" className="social-link" aria-label="Twitter"><i className="fab fa-twitter" /></a>
                <a href="#" className="social-link" aria-label="LinkedIn"><i className="fab fa-linkedin" /></a>
              </div>
            </div>

            <div className="footer-column">
              <h4>Product</h4>
              <ul className="footer-links">
                <li><a href="#features" className="footer-link">Features</a></li>
                <li><a href="#tech" className="footer-link">Technology</a></li>
                <li><a href="#" className="footer-link">Pricing</a></li>
                <li><a href="#" className="footer-link">Changelog</a></li>
              </ul>
            </div>

            <div className="footer-column">
              <h4>Resources</h4>
              <ul className="footer-links">
                <li><a href="#" className="footer-link">Documentation</a></li>
                <li><a href="#" className="footer-link">API Reference</a></li>
                <li><a href="#" className="footer-link">GitHub</a></li>
                <li><a href="#" className="footer-link">Community</a></li>
              </ul>
            </div>

            <div className="footer-column">
              <h4>Company</h4>
              <ul className="footer-links">
                <li><a href="#" className="footer-link">About</a></li>
                <li><a href="#" className="footer-link">Blog</a></li>
                <li><a href="#" className="footer-link">Careers</a></li>
                <li><a href="#" className="footer-link">Contact</a></li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <p className="footer-copyright">© 2026 Digital Walking Stick. Built at University of Waterloo.</p>
            <div className="footer-status">
              <span className="status-dot" />
              <span>All systems operational</span>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
