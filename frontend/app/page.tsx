import React from 'react'
import Link from "next/link"
const page = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4">
      <h1 className="text-3xl font-bold mb-6">Indoor Navigation System</h1>
      
      {/* Navigation Assistant - Main Feature */}
      <Link href="/navigate">
        <button className="px-8 py-4 bg-blue-600 hover:bg-blue-700 rounded-xl text-lg font-medium transition-all transform hover:scale-105">
          🧭 Start Navigation Assistant
        </button>
      </Link>
      
      <div className="flex gap-4 mt-4">
        <Link href="/signIn">
          <button className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition">
            Sign In
          </button>
        </Link>

        <Link href="/signUp">
          <button className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition">
            Sign Up
          </button>
        </Link>
      </div>
      
      <p className="text-gray-400 mt-8 text-center max-w-md">
        Voice-controlled indoor navigation for visually impaired users.
        <br />
        Say "help" to learn available commands.
      </p>
    </div>
  )
}

export default page
